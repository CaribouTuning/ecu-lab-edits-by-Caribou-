/**
 * A very small XML reader.
 *
 * RomRaider definitions are XML, and this project has no XML dependency and no
 * DOM in Node. What is needed is narrow — elements, attributes, text, comments,
 * CDATA — so it is cheaper to read a few hundred lines here than to take on a
 * parser dependency for a file format this simple.
 *
 * This is deliberately not a conforming XML parser. It does not do namespaces,
 * DTDs, or entity declarations. It handles the five predefined entities and
 * numeric character references, which is what definition files actually contain.
 * If it meets something it does not understand it throws, rather than guessing —
 * a misparsed definition means wrong addresses, and wrong addresses mean writing
 * bytes to the wrong place in a file destined for an ECU.
 */

/**
 * @typedef {object} XmlNode
 * @property {string} name
 * @property {Record<string, string>} attrs
 * @property {XmlNode[]} children
 * @property {string} text concatenated direct text content
 */

const ENTITIES = { lt: '<', gt: '>', amp: '&', apos: "'", quot: '"' };

/**
 * Expand the entities that appear in real definition files.
 *
 * @param {string} src
 * @returns {string}
 */
function decodeEntities(src) {
  if (!src.includes('&')) return src;
  return src.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body] ?? whole;
  });
}

/**
 * Parse an XML document into a tree.
 *
 * @param {string} src
 * @returns {XmlNode} the root element
 */
export function parseXml(src) {
  let i = 0;
  /** @type {XmlNode[]} */
  const stack = [];
  /** @type {XmlNode | null} */
  let root = null;

  const skipTo = (marker) => {
    const at = src.indexOf(marker, i);
    if (at < 0) throw new Error(`unterminated ${marker} in XML`);
    i = at + marker.length;
  };

  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt < 0) break;

    // Text between elements belongs to whatever is currently open.
    if (lt > i && stack.length) {
      stack[stack.length - 1].text += decodeEntities(src.slice(i, lt));
    }
    i = lt;

    if (src.startsWith('<!--', i)) {
      skipTo('-->');
      continue;
    }
    if (src.startsWith('<![CDATA[', i)) {
      const end = src.indexOf(']]>', i);
      if (end < 0) throw new Error('unterminated CDATA');
      if (stack.length) stack[stack.length - 1].text += src.slice(i + 9, end);
      i = end + 3;
      continue;
    }
    if (src.startsWith('<?', i)) {
      skipTo('?>');
      continue;
    }
    if (src.startsWith('<!', i)) {
      // DOCTYPE and friends. Skip the declaration, including any internal subset.
      const close = src.indexOf('>', i);
      if (close < 0) throw new Error('unterminated declaration');
      i = close + 1;
      continue;
    }

    const close = src.indexOf('>', i);
    if (close < 0) throw new Error('unterminated tag');
    let tag = src.slice(i + 1, close);
    i = close + 1;

    if (tag.startsWith('/')) {
      const name = tag.slice(1).trim();
      const open = stack.pop();
      if (!open) throw new Error(`closing tag </${name}> with nothing open`);
      if (open.name !== name) throw new Error(`</${name}> closes <${open.name}>`);
      continue;
    }

    const selfClosing = tag.endsWith('/');
    if (selfClosing) tag = tag.slice(0, -1);

    const nameMatch = /^([^\s/>]+)/.exec(tag);
    if (!nameMatch) throw new Error(`unreadable tag "<${tag}>"`);
    const name = nameMatch[1];

    /** @type {Record<string, string>} */
    const attrs = {};
    const attrPattern = /([^\s=/]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let m;
    while ((m = attrPattern.exec(tag.slice(name.length)))) {
      attrs[m[1]] = decodeEntities(m[3] ?? m[4] ?? '');
    }

    /** @type {XmlNode} */
    const node = { name, attrs, children: [], text: '' };
    if (stack.length) stack[stack.length - 1].children.push(node);
    else if (!root) root = node;

    if (!selfClosing) stack.push(node);
  }

  if (stack.length) throw new Error(`unclosed <${stack[stack.length - 1].name}>`);
  if (!root) throw new Error('no root element found');
  return root;
}

/**
 * Direct children with a given tag name.
 *
 * @param {XmlNode} node
 * @param {string} name
 * @returns {XmlNode[]}
 */
export function childrenNamed(node, name) {
  return node.children.filter((c) => c.name === name);
}

/**
 * First direct child with a given tag name.
 *
 * @param {XmlNode} node
 * @param {string} name
 * @returns {XmlNode | undefined}
 */
export function childNamed(node, name) {
  return node.children.find((c) => c.name === name);
}
