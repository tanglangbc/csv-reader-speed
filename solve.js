// Fast drop-in for csv-reader 1.0.0: returns exactly what readCsv returns for
// every input, but scans with native regex/indexOf searches and slice/split
// instead of one character at a time.
// Semantics follow the reference (vendor/csv-reader/index.js) exactly:
//  - U+FEFF at the very start is dropped
//  - a record ends at LF or CRLF; a line with no characters is no record
//  - outside quotes a CR not followed by LF is dropped (stray_cr)
//  - a field opening with a quote runs to the next non-doubled quote; "" is one
//    quote; CRLF or lone CR inside quotes reads as LF; text after the closing
//    quote up to the next comma or line break is appended as it stands
//    (quote_junk, when the field ends); a quote that never closes is a literal
//    character and the text after it is read again as unquoted
//    (unterminated_quote); a quote inside an unquoted field is literal
//  - fields stay strings, never trimmed or converted
//  - columns is the first record when header is true, else null; rows holds the
//    records after it, each padded (short_row, with fields) or cut (long_row,
//    with extra) to the first record's width
//  - each error is {code, line, row}, in the order met; line is the 1-based line
//    its record starts on (every LF, CRLF and lone CR inside quotes counted),
//    row its record's index in rows (null for the header).
//
// Pure: no clock, no randomness, no locale, nothing kept between calls.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

// One native regex scan for the next field delimiter (comma, LF or CR).
const DELIM = /[,\n\r]/g;
// One native regex scan for the next line break inside a quoted field.
const BR = /[\r\n]/g;

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;

  // The record being read: the line it starts on and its index in rows
  // (null: the header).
  let recordLine = 1;
  let recordRow = null;

  // Index of the next ',', '\n' or '\r' at or after i, or -1.
  function nextDelim(i) {
    DELIM.lastIndex = i;
    const m = DELIM.exec(text);
    return m === null ? -1 : m.index;
  }

  // Read an unquoted field starting at pos, appending onto `value` ('' normally,
  // '"' for an unterminated quote, or a quoted field's value for quote junk).
  // Returns [value, ended, added] where added counts characters kept after the
  // starting value. Stray CRs are dropped with a stray_cr error, in order.
  function readUnquoted(value) {
    let added = 0;
    let start = pos;
    let parts = null;
    for (;;) {
      const d = nextDelim(pos);
      if (d === -1) {
        if (parts === null) {
          value += text.slice(start);
          added += n - start;
        } else {
          parts.push(text.slice(start));
          added += n - start;
          value = parts.join('');
        }
        pos = n;
        return [value, END, added];
      }
      const code = text.charCodeAt(d);
      if (code === 44) { // ','
        if (parts === null) value += text.slice(start, d);
        else { parts.push(text.slice(start, d)); value = parts.join(''); }
        added += d - start;
        pos = d + 1;
        return [value, COMMA, added];
      }
      if (code === 10) { // '\n'
        if (parts === null) value += text.slice(start, d);
        else { parts.push(text.slice(start, d)); value = parts.join(''); }
        added += d - start;
        pos = d + 1;
        line += 1;
        return [value, LINE_BREAK, added];
      }
      if (d + 1 < n && text.charCodeAt(d + 1) === 10) { // CRLF
        if (parts === null) value += text.slice(start, d);
        else { parts.push(text.slice(start, d)); value = parts.join(''); }
        added += d - start;
        pos = d + 2;
        line += 1;
        return [value, LINE_BREAK, added];
      }
      // Stray CR: drop it, keep scanning from just after it.
      errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      if (parts === null) { parts = [value, text.slice(start, d)]; value = ''; }
      else parts.push(text.slice(start, d));
      added += d - start;
      pos = d + 1;
      start = pos;
    }
  }

  // Read a quoted field whose opening quote is at pos.
  // Returns [value, ended].
  function readQuoted() {
    const open = pos;
    const openLine = line;
    const q = text.indexOf('"', pos + 1);
    if (q === -1) {
      // Never closes: literal quote, text after it read again as unquoted.
      pos = open + 1;
      line = openLine;
      errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
      return readUnquoted('"');
    }
    // Fast path: the quote at q is not doubled, and no CR or LF sits inside.
    const hasEscape = text.charCodeAt(q + 1) === 34;
    let hasBreak = false;
    BR.lastIndex = pos + 1;
    const bm = BR.exec(text);
    if (bm !== null && bm.index < q) hasBreak = true;
    if (!hasEscape && !hasBreak) {
      const value = text.slice(pos + 1, q);
      pos = q + 1;
      return afterQuote(value);
    }
    // General quoted field: walk from pos+1 to the closing quote.
    let value = '';
    let seg = pos + 1;
    let p = pos + 1;
    let closed = false;
    while (p < n) {
      const c = text.charCodeAt(p);
      if (c === 34) { // '"'
        if (p + 1 < n && text.charCodeAt(p + 1) === 34) {
          value += text.slice(seg, p) + '"';
          p += 2;
          seg = p;
          continue;
        }
        value += text.slice(seg, p);
        p += 1;
        closed = true;
        break;
      }
      if (c === 13) { // '\r' inside quotes -> '\n', one line
        value += text.slice(seg, p) + '\n';
        line += 1;
        p += (p + 1 < n && text.charCodeAt(p + 1) === 10) ? 2 : 1;
        seg = p;
        continue;
      }
      if (c === 10) line += 1;
      p += 1;
    }
    if (!closed) {
      pos = open + 1;
      line = openLine;
      errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
      return readUnquoted('"');
    }
    pos = p;
    return afterQuote(value);
  }

  // After a quoted field closed at pos: comma, line break, end, or junk.
  function afterQuote(value) {
    if (pos >= n) return [value, END];
    const c = text.charCodeAt(pos);
    if (c === 44) { pos += 1; return [value, COMMA]; }
    if (c === 10) { pos += 1; line += 1; return [value, LINE_BREAK]; }
    if (c === 13 && pos + 1 < n && text.charCodeAt(pos + 1) === 10) {
      pos += 2; line += 1; return [value, LINE_BREAK];
    }
    const junk = readUnquoted(value);
    if (junk[2] > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
    return junk;
  }

  // Finish one record's fields: header, padding/cutting, or a stray-CR-only
  // line left with no characters (no record; its stray_cr errors stay).
  function finishRecord(fields, quoted) {
    if (fields.length === 1 && fields[0] === '' && !quoted) return;
    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      return;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) { pos += 1; line += 1; }
      else if (c === 13 && pos + 1 < n && text.charCodeAt(pos + 1) === 10) { pos += 2; line += 1; }
      else break;
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // Line fast path: no quote before the next LF, and no CR except a trailing
    // one that a real LF follows (CRLF). A trailing CR on the last line, with
    // no LF after it, is a stray CR, not a break, so the fast path must not
    // take it: it needs the general field parser instead.
    const e = text.indexOf('\n', pos);
    const le = e === -1 ? n : e;
    const q = text.indexOf('"', pos);
    if (q === -1 || q >= le) {
      const r = text.indexOf('\r', pos);
      if (r === -1 || r >= le || (e !== -1 && r === le - 1)) {
        let seg = text.slice(pos, le);
        if (seg.charCodeAt(seg.length - 1) === 13) seg = seg.slice(0, -1);
        const fields = seg.split(',');
        pos = e === -1 ? n : e + 1;
        line += 1;
        finishRecord(fields, false);
        continue;
      }
    }

    const fields = [];
    let ended;
    let quoted;
    do {
      quoted = text.charCodeAt(pos) === 34;
      const f = quoted ? readQuoted() : readUnquoted('');
      fields.push(f[0]);
      ended = f[1];
    } while (ended === COMMA);
    finishRecord(fields, quoted);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
