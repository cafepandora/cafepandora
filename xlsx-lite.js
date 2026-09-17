/*
  Generador mínimo de archivos .xlsx (OOXML) — sin dependencias ni CDN.
  Empaqueta el libro en un ZIP sin compresión (método "store"), que Excel,
  Numbers, LibreOffice y Google Sheets abren sin advertencias.

  Uso:
    const blob = XLSXLite.build([
      { name: 'Ventas', cols: [14, 30], freeze: 1, rows: [
          [{ v: 'Fecha', s: 'head' }, { v: 'Cliente', s: 'head' }],
          [{ v: new Date(), s: 'date' }, 'Ana'],
          [null, { v: 12000, s: 'money-b' }]
      ]}
    ]);
*/
(function (global) {
  'use strict';

  // ---------------------------------------------------------------- ZIP
  const CRC_TABLE = (function () {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  const encoder = new TextEncoder();

  function dosStamp(d) {
    return {
      time: ((d.getHours() & 0x1F) << 11) | ((d.getMinutes() & 0x3F) << 5) | ((d.getSeconds() >> 1) & 0x1F),
      date: (((d.getFullYear() - 1980) & 0x7F) << 9) | (((d.getMonth() + 1) & 0x0F) << 5) | (d.getDate() & 0x1F)
    };
  }

  function zipStore(entries) {
    const stamp = dosStamp(new Date());
    const chunks = [];
    const directory = [];
    let offset = 0;
    let size = 0;

    entries.forEach(function (entry) {
      const nameBytes = encoder.encode(entry.name);
      const data = entry.data;
      const crc = crc32(data);
      const localOffset = offset;

      const local = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);              // versión requerida
      lv.setUint16(6, 0, true);               // flags
      lv.setUint16(8, 0, true);               // método: sin comprimir
      lv.setUint16(10, stamp.time, true);
      lv.setUint16(12, stamp.date, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);
      local.set(nameBytes, 30);

      chunks.push(local, data);
      offset += local.length + data.length;

      const cd = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(cd.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);              // versión creadora
      cv.setUint16(6, 20, true);              // versión requerida
      cv.setUint16(8, 0, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, stamp.time, true);
      cv.setUint16(14, stamp.date, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);              // extra
      cv.setUint16(32, 0, true);              // comentario
      cv.setUint16(34, 0, true);              // disco inicial
      cv.setUint16(36, 0, true);              // atributos internos
      cv.setUint32(38, 0, true);              // atributos externos
      cv.setUint32(42, localOffset, true);
      cd.set(nameBytes, 46);
      directory.push(cd);
      size += cd.length;
    });

    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, size, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);

    return new Blob(chunks.concat(directory, [eocd]), {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
  }

  // -------------------------------------------------------------- OOXML
  // Índices que deben coincidir con el orden de <cellXfs> en styles.xml
  const STYLES = {
    '': 0,
    'b': 1,
    'money': 2,
    'money-b': 3,
    'head': 4,
    'title': 5,
    'num2': 6,
    'num2-b': 7,
    'date': 8
  };

  const STYLES_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="3">' +
      '<numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0"/>' +
      '<numFmt numFmtId="165" formatCode="#,##0.00"/>' +
      '<numFmt numFmtId="166" formatCode="dd/mm/yyyy hh:mm"/>' +
    '</numFmts>' +
    '<fonts count="4">' +
      '<font><sz val="11"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="14"/><color rgb="FF4A2D19"/><name val="Calibri"/></font>' +
    '</fonts>' +
    '<fills count="3">' +
      '<fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FF6B4226"/><bgColor indexed="64"/></patternFill></fill>' +
    '</fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="9">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
      '<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1">' +
        '<alignment vertical="center" wrapText="1"/></xf>' +
      '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="165" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
      '<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
      // Excel rechaza caracteres de control dentro de <t>
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  }

  function colLetter(index) {
    let n = index + 1, out = '';
    while (n > 0) {
      const rem = (n - 1) % 26;
      out = String.fromCharCode(65 + rem) + out;
      n = Math.floor((n - 1) / 26);
    }
    return out;
  }

  function excelSerial(d) {
    const days = Math.floor(
      (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000
    );
    const frac = (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400;
    return days + frac;
  }

  function cellXml(ref, cell) {
    if (cell === null || cell === undefined || cell === '') return '';
    const obj = (typeof cell === 'object' && !(cell instanceof Date)) ? cell : { v: cell };
    let value = obj.v;
    const style = STYLES[obj.s || ''] || 0;
    const attrs = ' r="' + ref + '"' + (style ? ' s="' + style + '"' : '');

    if (value instanceof Date) {
      return '<c' + attrs + '><v>' + excelSerial(value) + '</v></c>';
    }
    if (typeof value === 'number' && isFinite(value)) {
      return '<c' + attrs + '><v>' + value + '</v></c>';
    }
    if (typeof value === 'boolean') {
      return '<c' + attrs + ' t="b"><v>' + (value ? 1 : 0) + '</v></c>';
    }
    if (value === null || value === undefined || value === '') {
      return style ? '<c' + attrs + '/>' : '';
    }
    return '<c' + attrs + ' t="inlineStr"><is><t xml:space="preserve">' + esc(value) + '</t></is></c>';
  }

  function sheetXml(sheet) {
    const rows = sheet.rows || [];
    let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';

    if (sheet.freeze) {
      xml += '<sheetViews><sheetView workbookViewId="0">' +
        '<pane ySplit="' + sheet.freeze + '" topLeftCell="A' + (sheet.freeze + 1) + '"' +
        ' activePane="bottomLeft" state="frozen"/>' +
        '</sheetView></sheetViews>';
    }

    if (sheet.cols && sheet.cols.length) {
      xml += '<cols>';
      sheet.cols.forEach(function (width, i) {
        xml += '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + width + '" customWidth="1"/>';
      });
      xml += '</cols>';
    }

    xml += '<sheetData>';
    rows.forEach(function (row, r) {
      const cells = (row || []).map(function (cell, c) {
        return cellXml(colLetter(c) + (r + 1), cell);
      }).join('');
      xml += cells ? '<row r="' + (r + 1) + '">' + cells + '</row>' : '<row r="' + (r + 1) + '"/>';
    });
    xml += '</sheetData></worksheet>';
    return xml;
  }

  function safeSheetName(name, fallback) {
    const clean = String(name || fallback).replace(/[\[\]\*\?\/\\:]/g, ' ').trim().slice(0, 31);
    return clean || fallback;
  }

  function build(sheets) {
    const list = (sheets || []).filter(Boolean);
    if (!list.length) throw new Error('XLSXLite: se requiere al menos una hoja.');

    const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      list.map(function (_, i) {
        return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml"' +
          ' ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
      }).join('') +
      '</Types>';

    const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>';

    const workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"' +
      ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      list.map(function (sheet, i) {
        return '<sheet name="' + esc(safeSheetName(sheet.name, 'Hoja' + (i + 1))) + '"' +
          ' sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
      }).join('') +
      '</sheets></workbook>';

    const workbookRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      list.map(function (_, i) {
        return '<Relationship Id="rId' + (i + 1) + '"' +
          ' Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"' +
          ' Target="worksheets/sheet' + (i + 1) + '.xml"/>';
      }).join('') +
      '<Relationship Id="rId' + (list.length + 1) + '"' +
      ' Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>';

    const entries = [
      { name: '[Content_Types].xml', data: encoder.encode(contentTypes) },
      { name: '_rels/.rels', data: encoder.encode(rootRels) },
      { name: 'xl/workbook.xml', data: encoder.encode(workbook) },
      { name: 'xl/_rels/workbook.xml.rels', data: encoder.encode(workbookRels) },
      { name: 'xl/styles.xml', data: encoder.encode(STYLES_XML) }
    ];
    list.forEach(function (sheet, i) {
      entries.push({
        name: 'xl/worksheets/sheet' + (i + 1) + '.xml',
        data: encoder.encode(sheetXml(sheet))
      });
    });

    return zipStore(entries);
  }

  function download(sheets, filename) {
    const blob = build(sheets);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  global.XLSXLite = { build: build, download: download };
})(typeof window !== 'undefined' ? window : globalThis);
