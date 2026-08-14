/*
 * npbridge — a structured, read-only front end to nisprog's own code.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (c) 2026 the ECU Lab contributors
 *
 * Links against freediag and nisprog and calls their command handlers directly,
 * instead of piping text through the nisprog CLI and reading its prompt back.
 * This is the approach fenugrec — nisprog's author — recommended when asked
 * about building a front end:
 *
 *   "Interfacing to the CLI will be messy, you'd almost be better off linking
 *    against libdiag and some of the nisprog code, then calling command handlers
 *    directly instead of trying to pipe stuff through stdin/stdout."
 *      — romraider.com forum, thread 14867
 *
 * He was right. Screen-scraping meant depending on a prompt string, stripping a
 * command echo that only appears when stdin is a pipe, and inferring success by
 * pattern-matching English prose. Here every operation returns an enum.
 *
 * READ-ONLY BY CONSTRUCTION
 * The previous design was read-only because a string allowlist rejected the
 * dangerous command names. This one is read-only because it contains no code
 * path that reaches them. There is no command dispatch table and no way to name
 * a handler from outside: the protocol has a fixed set of operations, each
 * wired to a specific function at compile time. cmd_flrom, cmd_flblock,
 * cmd_writevin and cmd_npt are never called from this file, so no input can
 * reach them. Grep this file for "flrom" and the only hit is this paragraph.
 *
 * TWO OUTPUT STREAMS
 * freediag and nisprog print human-readable progress with printf, straight to
 * stdout, and there is no intercepting that short of replacing their I/O. So
 * stdout stays theirs — it is the log — and this program writes its structured
 * replies to file descriptor 3, which the parent opens as an extra pipe. The
 * two never interleave because they are different pipes.
 *
 * If fd 3 is not open (running it by hand in a terminal), replies fall back to
 * stdout, tagged so they are still readable.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#include "diag.h"
#include "scantool_cli.h"
#include "libcli.h"

#include "nisprog.h"

/*
 * Globals that nisprog.c would normally define. We replace nisprog.c — it holds
 * main() — so these have to live here.
 */
FILE *dbg_stream = NULL;        /* nislib writes diagnostics here */
enum npstate_t npstate;

/*
 * np_cli.c calls this, and nisprog.c is where it normally lives. Same body as
 * the original: clear what we know about the attached ECU.
 */
void nisecu_cleardata(struct nisecu_t *pne) {
	sprintf((char *)pne->ecuid, "UNK");
	pne->keyset = NULL;
	pne->flashdev = NULL;
}

#define NPBRIDGE_VERSION "0.2.0"
#define MAX_LINE 1024
#define MAX_ARGS 8

/** Where structured replies go. fd 3 when the parent provides it. */
static FILE *replies = NULL;

/** Emit a JSON string value with the characters JSON requires escaped. */
static void json_escape(FILE *out, const char *s) {
	if (!s) {
		fputs("null", out);
		return;
	}
	fputc('"', out);
	for (; *s; s++) {
		unsigned char c = (unsigned char)*s;
		switch (c) {
		case '"':  fputs("\\\"", out); break;
		case '\\': fputs("\\\\", out); break;
		case '\n': fputs("\\n", out); break;
		case '\r': fputs("\\r", out); break;
		case '\t': fputs("\\t", out); break;
		default:
			if (c < 0x20) fprintf(out, "\\u%04x", c);
			else fputc((char)c, out);
		}
	}
	fputc('"', out);
}

/**
 * Send one reply. `detail` may be NULL.
 *
 * One JSON object per line, flushed immediately — the parent is waiting on it,
 * and a buffered reply is indistinguishable from a hung ECU.
 */
static void reply(const char *op, int ok, const char *detail, const char *extra_key, const char *extra_val) {
	fputs("{\"op\":", replies);
	json_escape(replies, op);
	fprintf(replies, ",\"ok\":%s", ok ? "true" : "false");
	if (detail) {
		fputs(",\"detail\":", replies);
		json_escape(replies, detail);
	}
	if (extra_key && extra_val) {
		fprintf(replies, ",\"%s\":", extra_key);
		json_escape(replies, extra_val);
	}
	fputs("}\n", replies);
	fflush(replies);
}

/** Human-readable name for a handler's return code. */
static const char *retval_name(enum cli_retval rv) {
	switch (rv) {
	case CMD_OK:     return "ok";
	case CMD_USAGE:  return "bad arguments";
	case CMD_FAILED: return "command failed";
	case CMD_EXIT:   return "exit";
	case CMD_UP:     return "up";
	default:         return "unknown";
	}
}

/**
 * Invoke one of freediag's `set` sub-commands by name.
 *
 * Walks set_cmd_table rather than parsing a command line. Returns 0 on success.
 */
static int run_set(const char *name, const char *value) {
	const struct cmd_tbl_entry *entry;

	for (entry = set_cmd_table; entry->command != NULL; entry++) {
		if (strcasecmp(entry->command, name) != 0) continue;
		if (entry->routine == NULL) return -1;

		char *argv[2];
		argv[0] = (char *)name;
		argv[1] = (char *)value;
		return (entry->routine(value ? 2 : 1, argv) == CMD_OK) ? 0 : -1;
	}
	return -1;
}

/** Call a nisprog command handler with a fixed argument list. */
static enum cli_retval call(enum cli_retval (*fn)(int, char **), int argc, char **argv) {
	return fn(argc, argv);
}

/**
 * Set up the transport and connect.
 *
 * The sequence is the one from nisprog's USING.txt. Doing it through the set
 * table means freediag validates each value exactly as it would from its own
 * command line — no reimplementation of what "iso14230" means.
 */
static void op_connect(int argc, char **argv) {
	if (argc < 2) {
		reply("connect", 0, "usage: connect <port> [interface] [dumbopts]", NULL, NULL);
		return;
	}
	const char *port = argv[1];
	const char *iface = (argc > 2) ? argv[2] : "dumb";
	const char *dumbopts = (argc > 3) ? argv[3] : "0x48";

	if (run_set("interface", iface))      { reply("connect", 0, "could not select interface", NULL, NULL); return; }
	if (run_set("port", port))            { reply("connect", 0, "could not set port", NULL, NULL); return; }
	if (run_set("dumbopts", dumbopts))    { reply("connect", 0, "could not set dumbopts", NULL, NULL); return; }
	if (run_set("l2protocol", "iso14230")){ reply("connect", 0, "could not set l2protocol", NULL, NULL); return; }
	if (run_set("initmode", "fast"))      { reply("connect", 0, "could not set initmode", NULL, NULL); return; }
	if (run_set("testerid", "0xfc"))      { reply("connect", 0, "could not set testerid", NULL, NULL); return; }
	if (run_set("destaddr", "0x10"))      { reply("connect", 0, "could not set destaddr", NULL, NULL); return; }
	if (run_set("addrtype", "phys"))      { reply("connect", 0, "could not set addrtype", NULL, NULL); return; }

	char *nc_argv[1] = { (char *)"npconn" };
	enum cli_retval rv = call(cmd_npconn, 1, nc_argv);
	if (rv != CMD_OK) {
		reply("connect", 0, retval_name(rv), NULL, NULL);
		return;
	}

	/* cmd_npconn fills in nisecu.ecuid on success. */
	reply("connect", 1, NULL, "ecuid", (const char *)nisecu.ecuid);
}

/** Report the ECU id the connection established, with no bus traffic. */
static void op_ecuid(void) {
	if (npstate == NP_DISC) {
		reply("ecuid", 0, "not connected", NULL, NULL);
		return;
	}
	reply("ecuid", 1, NULL, "ecuid", (const char *)nisecu.ecuid);
}

/** Declare the MCU, which is what tells nisprog the ROM size. */
static void op_setdev(int argc, char **argv) {
	if (argc < 2) {
		reply("setdev", 0, "usage: setdev <7051|7055|7058>", NULL, NULL);
		return;
	}
	char *a[2] = { (char *)"setdev", argv[1] };
	enum cli_retval rv = call(cmd_setdev, 2, a);
	reply("setdev", rv == CMD_OK, rv == CMD_OK ? NULL : retval_name(rv), NULL, NULL);
}

/** Ask nisprog to work out the seed/key set for this ECU. */
static void op_guesskey(void) {
	char *a[1] = { (char *)"gk" };
	enum cli_retval rv = call(cmd_guesskey, 1, a);
	reply("guesskey", rv == CMD_OK, rv == CMD_OK ? NULL : retval_name(rv), NULL, NULL);
}

/**
 * Upload npkern into ECU RAM.
 *
 * This writes — to RAM, not flash. It costs no flash cycle and the ECU returns
 * to stock behaviour on reset. Without it a full read runs about fifty times
 * slower, so it is not optional in practice.
 */
static void op_kernel(int argc, char **argv) {
	if (argc < 2) {
		reply("kernel", 0, "usage: kernel <path to npkern .bin>", NULL, NULL);
		return;
	}
	char *a[2] = { (char *)"runkernel", argv[1] };
	enum cli_retval rv = call(cmd_runkernel, 2, a);
	reply("kernel", rv == CMD_OK, rv == CMD_OK ? NULL : retval_name(rv), NULL, NULL);
}

/** Read memory to a file. The only bulk-transfer operation this program has. */
static void op_dump(int argc, char **argv) {
	if (argc < 4) {
		reply("dump", 0, "usage: dump <file> <start> <length>", NULL, NULL);
		return;
	}
	char *a[4] = { (char *)"dumpmem", argv[1], argv[2], argv[3] };
	enum cli_retval rv = call(cmd_dumpmem, 4, a);
	reply("dump", rv == CMD_OK, rv == CMD_OK ? NULL : retval_name(rv), "file", argv[1]);
}

/** Reset the ECU out of the kernel and back onto its own firmware. */
static void op_stopkernel(void) {
	char *a[1] = { (char *)"stopkernel" };
	enum cli_retval rv = call(cmd_stopkernel, 1, a);
	reply("stopkernel", rv == CMD_OK, rv == CMD_OK ? NULL : retval_name(rv), NULL, NULL);
}

/** Close the session. */
static void op_disconnect(void) {
	char *a[1] = { (char *)"npdisc" };
	enum cli_retval rv = call(cmd_npdisc, 1, a);
	reply("disconnect", rv == CMD_OK, rv == CMD_OK ? NULL : retval_name(rv), NULL, NULL);
}

/** Split a line on whitespace. Paths may not contain spaces — nisprog's own
 *  dumpmem has the same restriction, so this loses nothing. */
static int tokenize(char *line, char **argv, int max) {
	int argc = 0;
	char *p = line;

	while (*p && argc < max) {
		while (*p == ' ' || *p == '\t') p++;
		if (!*p) break;
		argv[argc++] = p;
		while (*p && *p != ' ' && *p != '\t') p++;
		if (*p) *p++ = '\0';
	}
	return argc;
}

int main(void) {
	char line[MAX_LINE];
	char *argv[MAX_ARGS];

	dbg_stream = stdout;

	/*
	 * Structured replies go to fd 3 when the parent opened one. dup() is a cheap
	 * way to ask "is this descriptor open?" without assuming anything.
	 */
	if (dup(3) >= 0) {
		close(dup(3));
		replies = fdopen(3, "w");
	}
	if (!replies) replies = stdout;

	npstate = NP_DISC;
	nisecu_cleardata(&nisecu);

	if (diag_init() != 0) {
		reply("start", 0, "diag_init failed", NULL, NULL);
		return 1;
	}
	if (set_init() != 0) {
		reply("start", 0, "set_init failed", NULL, NULL);
		diag_end();
		return 1;
	}

	reply("start", 1, NULL, "version", NPBRIDGE_VERSION);

	while (fgets(line, sizeof(line), stdin)) {
		line[strcspn(line, "\r\n")] = '\0';

		int argc = tokenize(line, argv, MAX_ARGS);
		if (argc == 0) continue;

		const char *op = argv[0];

		if      (!strcasecmp(op, "connect"))    op_connect(argc, argv);
		else if (!strcasecmp(op, "ecuid"))      op_ecuid();
		else if (!strcasecmp(op, "setdev"))     op_setdev(argc, argv);
		else if (!strcasecmp(op, "guesskey"))   op_guesskey();
		else if (!strcasecmp(op, "kernel"))     op_kernel(argc, argv);
		else if (!strcasecmp(op, "dump"))       op_dump(argc, argv);
		else if (!strcasecmp(op, "stopkernel")) op_stopkernel();
		else if (!strcasecmp(op, "disconnect")) op_disconnect();
		else if (!strcasecmp(op, "ping"))       reply("ping", 1, NULL, "version", NPBRIDGE_VERSION);
		else if (!strcasecmp(op, "quit"))       { reply("quit", 1, NULL, NULL, NULL); break; }
		else {
			/*
			 * Every operation this program supports is listed above and reads
			 * only. An unknown word is not looked up anywhere — there is no
			 * table to look it up in.
			 */
			reply(op, 0, "unknown operation; this build is read-only and supports "
			             "connect, ecuid, setdev, guesskey, kernel, dump, stopkernel, "
			             "disconnect, ping, quit", NULL, NULL);
		}
	}

	set_close();
	diag_end();
	return 0;
}
