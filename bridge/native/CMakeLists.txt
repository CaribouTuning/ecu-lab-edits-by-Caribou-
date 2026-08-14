# Build npbridge against a nisprog source tree.
#
# SPDX-License-Identifier: GPL-3.0-or-later
#
# nisprog is not built as a library, so this compiles its sources directly —
# every one except nisprog.c, which holds main(). npbridge.c supplies main() and
# the two globals nisprog.c would otherwise define.
#
# Point NISPROG_SRC at a checkout built with `--recursive`:
#
#   cmake -S bridge/native -B build/native -DNISPROG_SRC=/path/to/nisprog
#   cmake --build build/native
#
# The nisprog tree must have been configured and built once first, because this
# links the freediag libraries and uses the generated version.c from its build
# directory.

cmake_minimum_required(VERSION 3.13)
project(npbridge C)

set(CMAKE_C_STANDARD 99)

if(NOT DEFINED NISPROG_SRC)
	message(FATAL_ERROR "Set -DNISPROG_SRC=/path/to/nisprog (a checkout cloned with --recursive)")
endif()

# Where nisprog's own build put its artifacts. Defaults to the conventional
# in-tree "build" directory.
if(NOT DEFINED NISPROG_BUILD)
	set(NISPROG_BUILD "${NISPROG_SRC}/build")
endif()

if(NOT EXISTS "${NISPROG_SRC}/np_cli.c")
	message(FATAL_ERROR "No np_cli.c under NISPROG_SRC=${NISPROG_SRC}")
endif()
if(NOT EXISTS "${NISPROG_BUILD}/version.c")
	message(FATAL_ERROR
		"No generated version.c under ${NISPROG_BUILD}. Build nisprog itself first:\n"
		"  cmake -S ${NISPROG_SRC} -B ${NISPROG_BUILD} && cmake --build ${NISPROG_BUILD}")
endif()

# Everything nisprog builds except nisprog.c — that is the file we are replacing.
set(NISPROG_OBJECTS
	${NISPROG_SRC}/np_cli.c
	${NISPROG_SRC}/nis_backend.c
	${NISPROG_SRC}/npk_backend.c
	${NISPROG_SRC}/ssm_backend.c
	${NISPROG_SRC}/scantool_bits.c
	${NISPROG_SRC}/nissutils/cli_utils/nislib.c
	${NISPROG_SRC}/nissutils/cli_utils/ecuid_list.c
	${NISPROG_BUILD}/version.c
)

add_executable(npbridge npbridge.c ${NISPROG_OBJECTS})

target_include_directories(npbridge PRIVATE
	${NISPROG_SRC}
	${NISPROG_SRC}/freediag/scantool
	${NISPROG_SRC}/nissutils/cli_utils
	${NISPROG_BUILD}
	${NISPROG_BUILD}/external
)

# Link order copied from nisprog's own link line: libdiag appears twice because
# freediagcli calls back into it, and libcli needs readline.
target_link_libraries(npbridge
	${NISPROG_BUILD}/external/scantool/libdiag.a
	${NISPROG_BUILD}/external/scantool/libfreediagcli.a
	${NISPROG_BUILD}/external/scantool/libdiag.a
	m
	${NISPROG_BUILD}/external/scantool/libcli.a
	readline
)

install(TARGETS npbridge RUNTIME DESTINATION bin)
