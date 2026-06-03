// Progressive import test — isolates which import hangs
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  var results = [];
  var start = Date.now();

  // Test 1: No imports
  results.push({ step: 1, name: "no-imports", elapsed: Date.now() - start });

  // Test 2: opc-resolver
  try {
    var t2 = Date.now();
    await import("./opc-resolver.js");
    results.push({ step: 2, name: "opc-resolver", ok: true, elapsed: Date.now() - t2 });
  } catch (e) {
    results.push({ step: 2, name: "opc-resolver", ok: false, error: e.message });
  }

  // Test 3: pptx-slide-ops
  try {
    var t3 = Date.now();
    await import("./pptx-slide-ops.js");
    results.push({ step: 3, name: "pptx-slide-ops", ok: true, elapsed: Date.now() - t3 });
  } catch (e) {
    results.push({ step: 3, name: "pptx-slide-ops", ok: false, error: e.message });
  }

  // Test 4: pptx-slide-copy
  try {
    var t4 = Date.now();
    await import("./pptx-slide-copy.js");
    results.push({ step: 4, name: "pptx-slide-copy", ok: true, elapsed: Date.now() - t4 });
  } catch (e) {
    results.push({ step: 4, name: "pptx-slide-copy", ok: false, error: e.message });
  }

  // Test 5: pptx-assembler
  try {
    var t5 = Date.now();
    await import("./pptx-assembler.js");
    results.push({ step: 5, name: "pptx-assembler", ok: true, elapsed: Date.now() - t5 });
  } catch (e) {
    results.push({ step: 5, name: "pptx-assembler", ok: false, error: e.message });
  }

  // Test 6: pptx-validator
  try {
    var t6 = Date.now();
    await import("./pptx-validator.js");
    results.push({ step: 6, name: "pptx-validator", ok: true, elapsed: Date.now() - t6 });
  } catch (e) {
    results.push({ step: 6, name: "pptx-validator", ok: false, error: e.message });
  }

  // Test 7: pptx-visual-regression
  try {
    var t7 = Date.now();
    await import("./pptx-visual-regression.js");
    results.push({ step: 7, name: "pptx-visual-regression", ok: true, elapsed: Date.now() - t7 });
  } catch (e) {
    results.push({ step: 7, name: "pptx-visual-regression", ok: false, error: e.message });
  }

  // Test 8: full diagnostics import
  try {
    var t8 = Date.now();
    await import("./pptx-diagnostics.js");
    results.push({ step: 8, name: "pptx-diagnostics", ok: true, elapsed: Date.now() - t8 });
  } catch (e) {
    results.push({ step: 8, name: "pptx-diagnostics", ok: false, error: e.message });
  }

  res.end(JSON.stringify({ ok: true, totalElapsed: Date.now() - start, results: results }));
}
