#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════
//  TEST PPTX GENERATOR
//  Creates a PPTX with shapes, text, images for merge testing
// ═══════════════════════════════════════════════════════════

const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

var OUTPUT_DIR = path.join(__dirname, "output");
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Create a simple 1x1 red PNG for embedding
function createRedPng() {
  // Minimal valid 1x1 red PNG
  var base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  return Buffer.from(base64, "base64");
}

var zip = new JSZip();

// [Content_Types].xml
zip.file("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n' +
'  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n' +
'  <Default Extension="xml" ContentType="application/xml"/>\n' +
'  <Default Extension="png" ContentType="image/png"/>\n' +
'  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>\n' +
'  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>\n' +
'  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>\n' +
'  <Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>\n' +
'  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>\n' +
'  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>\n' +
'</Types>');

// _rels/.rels
zip.file("_rels/.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
'  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>\n' +
'</Relationships>');

// Theme
zip.file("ppt/theme/theme1.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
'<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Test Theme">\n' +
'  <a:themeElements>\n' +
'    <a:clrScheme name="Test">\n' +
'      <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>\n' +
'      <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>\n' +
'      <a:accent1><a:srgbClr val="1B2A4A"/></a:accent1>\n' +
'      <a:accent2><a:srgbClr val="ED7D31"/></a:accent2>\n' +
'    </a:clrScheme>\n' +
'    <a:fontScheme name="Test">\n' +
'      <a:majorFont><a:latin typeface="Calibri Light"/></a:majorFont>\n' +
'      <a:minorFont><a:latin typeface="Calibri"/></a:minorFont>\n' +
'    </a:fontScheme>\n' +
'    <a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme>\n' +
'  </a:themeElements>\n' +
'</a:theme>');

// Slide master
zip.file("ppt/slideMasters/slideMaster1.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
'<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">\n' +
'  <p:cSld><p:spTree>\n' +
'    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>\n' +
'    <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>\n' +
'  </p:spTree></p:cSld>\n' +
'  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>\n' +
'  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>\n' +
'</p:sldMaster>');

zip.file("ppt/slideMasters/_rels/slideMaster1.xml.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
'  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>\n' +
'  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>\n' +
'</Relationships>');

// Slide layout
zip.file("ppt/slideLayouts/slideLayout1.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
'<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank">\n' +
'  <p:cSld><p:spTree>\n' +
'    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>\n' +
'    <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>\n' +
'  </p:spTree></p:cSld>\n' +
'  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>\n' +
'</p:sldLayout>');

zip.file("ppt/slideLayouts/_rels/slideLayout1.xml.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
'  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>\n' +
'</Relationships>');

// SLIDE 1: Background + Title text + body text (simulates a canonical slide)
var slide1Xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
'<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">\n' +
'  <p:cSld>\n' +
'    <p:bg><p:bgPr><a:solidFill><a:srgbClr val="0B1A4A"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>\n' +
'    <p:spTree>\n' +
'      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>\n' +
'      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>\n' +
'      <!-- Title shape -->\n' +
'      <p:sp>\n' +
'        <p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>\n' +
'        <p:spPr><a:xfrm><a:off x="1000000" y="500000"/><a:ext cx="7000000" cy="800000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>\n' +
'        <p:txBody><a:bodyPr wrap="square" rtlCol="0"/><a:lstStyle/>\n' +
'          <a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="en-US" sz="3600" b="1"/><a:t>Why Brinc</a:t></a:r></a:p>\n' +
'        </p:txBody>\n' +
'      </p:sp>\n' +
'      <!-- Subtitle shape -->\n' +
'      <p:sp>\n' +
'        <p:nvSpPr><p:cNvPr id="3" name="Subtitle"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>\n' +
'        <p:spPr><a:xfrm><a:off x="1000000" y="1500000"/><a:ext cx="7000000" cy="400000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>\n' +
'        <p:txBody><a:bodyPr wrap="square" rtlCol="0"/><a:lstStyle/>\n' +
'          <a:p><a:r><a:rPr lang="en-US" sz="1800"/><a:t>Global innovation ecosystem</a:t></a:r></a:p>\n' +
'        </p:txBody>\n' +
'      </p:sp>\n' +
'      <!-- Accent bar shape -->\n' +
'      <p:sp>\n' +
'        <p:nvSpPr><p:cNvPr id="4" name="AccentBar"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>\n' +
'        <p:spPr><a:xfrm><a:off x="1000000" y="2100000"/><a:ext cx="1500000" cy="50000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="3264B9"/></a:solidFill></p:spPr>\n' +
'        <p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody>\n' +
'      </p:sp>\n' +
'      <!-- Body text with bullet points -->\n' +
'      <p:sp>\n' +
'        <p:nvSpPr><p:cNvPr id="5" name="Body"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>\n' +
'        <p:spPr><a:xfrm><a:off x="1000000" y="2300000"/><a:ext cx="7000000" cy="2000000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>\n' +
'        <p:txBody><a:bodyPr wrap="square" rtlCol="0"/><a:lstStyle/>\n' +
'          <a:p><a:r><a:rPr lang="en-US" sz="1400"/><a:t>- 12+ years of innovation</a:t></a:r></a:p>\n' +
'          <a:p><a:r><a:rPr lang="en-US" sz="1400"/><a:t>- 75+ programs executed</a:t></a:r></a:p>\n' +
'          <a:p><a:r><a:rPr lang="en-US" sz="1400"/><a:t>- 170+ portfolio companies</a:t></a:r></a:p>\n' +
'          <a:p><a:r><a:rPr lang="en-US" sz="1400"/><a:t>- $1.69B+ valuation</a:t></a:r></a:p>\n' +
'        </p:txBody>\n' +
'      </p:sp>\n' +
'      <!-- Image placeholder -->\n' +
'      <p:pic>\n' +
'        <p:nvPicPr><p:cNvPr id="6" name="TestImage"/><p:cNvPicPr preferRelativeResize="0"/><p:nvPr/></p:nvPicPr>\n' +
'        <p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>\n' +
'        <p:spPr><a:xfrm><a:off x="7500000" y="500000"/><a:ext cx="1000000" cy="1000000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>\n' +
'      </p:pic>\n' +
'    </p:spTree>\n' +
'  </p:cSld>\n' +
'  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>\n' +
'</p:sld>';

zip.file("ppt/slides/slide1.xml", slide1Xml);

// Slide 1 rels (references layout + image)
zip.file("ppt/slides/_rels/slide1.xml.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
'  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>\n' +
'  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>\n' +
'</Relationships>');

// Embed a test image
zip.file("ppt/media/image1.png", createRedPng());

// SLIDE 2: Simple second slide
var slide2Xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
'<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">\n' +
'  <p:cSld>\n' +
'    <p:spTree>\n' +
'      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>\n' +
'      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>\n' +
'      <p:sp>\n' +
'        <p:nvSpPr><p:cNvPr id="2" name="Title2"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>\n' +
'        <p:spPr><a:xfrm><a:off x="1000000" y="1000000"/><a:ext cx="7000000" cy="800000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>\n' +
'        <p:txBody><a:bodyPr wrap="square" rtlCol="0"/><a:lstStyle/>\n' +
'          <a:p><a:r><a:rPr lang="en-US" sz="2800" b="1"/><a:t>Second Slide</a:t></a:r></a:p>\n' +
'        </p:txBody>\n' +
'      </p:sp>\n' +
'    </p:spTree>\n' +
'  </p:cSld>\n' +
'  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>\n' +
'</p:sld>';

zip.file("ppt/slides/slide2.xml", slide2Xml);
zip.file("ppt/slides/_rels/slide2.xml.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
'  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>\n' +
'</Relationships>');

// Presentation
zip.file("ppt/presentation.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
'<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">\n' +
'  <p:sldIdLst>\n' +
'    <p:sldId id="256" r:id="rId1"/>\n' +
'    <p:sldId id="257" r:id="rId2"/>\n' +
'  </p:sldIdLst>\n' +
'  <p:sldSz cx="9144000" cy="5143500" type="screen16x9"/>\n' +
'  <p:notesSz cx="6858000" cy="9144000"/>\n' +
'  <p:defaultTextStyle/>\n' +
'</p:presentation>');

zip.file("ppt/_rels/presentation.xml.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
'  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>\n' +
'  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>\n' +
'  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>\n' +
'  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps" Target="presProps.xml"/>\n' +
'  <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/viewProps" Target="viewProps.xml"/>\n' +
'  <Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>\n' +
'</Relationships>');

// presProps & viewProps
zip.file("ppt/presProps.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
'<p:presPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:showType p:val="present"/></p:presPr>');

zip.file("ppt/viewProps.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
'<p:viewPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:normalViewPr><p:restoredLeft sz="15620" autoAdjust="0"/><p:restoredTop sz="94660" autoAdjust="0"/></p:normalViewPr><p:slideViewPr><p:cSldViewPr><p:cViewPr varScale="1"><p:scale><a:sx n="104" d="100"/><a:sy n="104" d="100"/></p:scale><p:origin x="-222" y="-90"/></p:cViewPr><p:guideLst/></p:cSldViewPr></p:slideViewPr><p:notesTextViewPr><p:cViewPr><p:scale><a:sx n="100" d="100"/><a:sy n="100" d="100"/></p:scale><p:origin x="0" y="0"/></p:cViewPr></p:notesTextViewPr><p:gridSpacing cx="720000" cy="720000"/></p:viewPr>');

// Generate
zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }).then(function(buffer) {
  var outputPath = path.join(OUTPUT_DIR, "test_canonical.pptx");
  fs.writeFileSync(outputPath, buffer);
  console.log("[GEN] Test PPTX created: " + outputPath + " (" + Math.round(buffer.length / 1024) + " KB)");
  console.log("[GEN] Contains 2 slides with shapes, formatted text, and an embedded PNG image");
}).catch(function(err) {
  console.error("[GEN] Error:", err);
});
