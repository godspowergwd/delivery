/* One-shot repair of scripts/e2e.mjs for the simplified 3-step kitchen workflow. */
const fs = require('fs');
const file = 'scripts/e2e.mjs';
let src = fs.readFileSync(file, 'utf8');
const EOL = src.includes('\r\n') ? '\r\n' : '\n';
const L = (...lines) => lines.join(EOL);
let ok = 0;
let miss = 0;

const swap = (label, from, to) => {
  if (!src.includes(from)) {
    console.log('MISS  ' + label);
    miss += 1;
    return;
  }
  src = src.replace(from, to);
  ok += 1;
  console.log('OK    ' + label);
};

// a. Helper body: the kitchen no longer has a "ready" step.
swap(
  'helper action list',
  L("  const sendOutForDelivery = async (orderId, tag) => {", "    for (const action of ['accept', 'preparing', 'ready']) {"),
  L('  /** Drives an order through the three kitchen steps: accept -> serving -> dispatch. */', '  const sendOutForDelivery = async (orderId, tag) => {', "    for (const action of ['accept', 'preparing', 'dispatch']) {"),
);

// b. Section 5: assert the order reaches OUT_FOR_DELIVERY and cannot be completed by the kitchen.
swap(
  'section 5 final assertion',
  L('  const after = await req(`/kitchen/orders/${oid}`, { token: kitchen });', '  const d = un(after.data) || {};', '  const st = d.status || (d.order && d.order.status);', "  check(st === 'DELIVERED', 'created order reaches DELIVERED', `status=${st}`);", '  ctx.orderStatus = st;'),
  L('', '  // The kitchen workflow stops at dispatch: only a driver completes a delivery.', "  const kitchenComplete = await req(`/kitchen/orders/${oid}/complete`, { method: 'POST', token: kitchen });", "  check(kitchenComplete.status >= 400, 'kitchen cannot complete a delivery', `status=${kitchenComplete.status}`);", '', '  const after = await req(`/kitchen/orders/${oid}`, { token: kitchen });', '  const d = un(after.data) || {};', '  const st = d.status || (d.order && d.order.status);', "  check(st === 'OUT_FOR_DELIVERY', 'created order reaches OUT_FOR_DELIVERY', `status=${st}`);", '  ctx.orderStatus = st;'),
);

// c. Order A: the driver accepts a dispatched order, then completes it.
swap(
  'order A pickup -> accept/complete',
  L("    const pickup = await req(`/driver/deliveries/${orderA}/pickup`, { method: 'POST', token: driver });", "    check(pickup.status === 200, 'driver picks up (READY -> OUT_FOR_DELIVERY)', `status=${pickup.status}`);", '', "    const complete = await req(`/driver/deliveries/${orderA}/complete`, { method: 'POST', token: driver });", "    check(complete.status === 200, 'driver completes (OUT_FOR_DELIVERY -> DELIVERED)', `status=${complete.status}`);", '', "    const guard = await req(`/driver/deliveries/${orderA}/pickup`, { method: 'POST', token: driver });", "    check(guard.status >= 400, 'driver cannot re-pickup a delivered order', `status=${guard.status}`);"),
  L("    const complete = await req(`/driver/deliveries/${orderA}/complete`, { method: 'POST', token: driver });", "    check(complete.status === 200, 'driver completes (OUT_FOR_DELIVERY -> DELIVERED)', `status=${complete.status}`);", '', "    const guard = await req(`/driver/deliveries/${orderA}/accept`, { method: 'POST', token: driver });", "    check(guard.status >= 400, 'driver cannot re-accept a delivered order', `status=${guard.status}`);"),
);

// d. Order B: dispatched by an admin, so the driver goes straight to completion.
swap(
  'order B pickup removed',
  L("        const pickup = await req(`/driver/deliveries/${orderB}/pickup`, { method: 'POST', token: driver });", "        check(pickup.status === 200, 'driver starts the dispatched delivery', `status=${pickup.status}`);", "        const complete = await req(`/driver/deliveries/${orderB}/complete`, { method: 'POST', token: driver });"),
  "        const complete = await req(`/driver/deliveries/${orderB}/complete`, { method: 'POST', token: driver });",
);

// e. Order C: issue reporting happens during an active delivery.
swap(
  'order C pickup removed',
  L("    await req(`/driver/deliveries/${orderC}/accept`, { method: 'POST', token: driver });", "    await req(`/driver/deliveries/${orderC}/pickup`, { method: 'POST', token: driver });"),
  "    await req(`/driver/deliveries/${orderC}/accept`, { method: 'POST', token: driver });",
);

fs.writeFileSync(file, src);
console.log(`\napplied=${ok} missing=${miss}`);

const check = fs.readFileSync(file, 'utf8');
console.log('remaining pickup refs: ' + (check.match(/pickup/g) || []).length);
console.log("remaining 'ready' action refs: " + (check.match(/'ready'/g) || []).length);
console.log('sendOutForDelivery refs: ' + (check.match(/sendOutForDelivery/g) || []).length);


// 1. Rename the helper: the kitchen no longer has a "ready" step.
swap(
  'rename helper -> sendOutForDelivery',
  '  const readyForPickup = async (orderId, tag) => {\n    for (const action of [\'accept\', \'preparing\', \'ready\']) {',
  '  /** Drives an order through the three kitchen steps: accept -> serving -> dispatch. */\n  const sendOutForDelivery = async (orderId, tag) => {\n    for (const action of [\'accept\', \'preparing\', \'dispatch\']) {',
);
swap(
  'helper failure message',
  'bad(`kitchen could not move ${tag} to READY`, `status=${r.status} at ${action}`);',
  'bad(`kitchen could not move ${tag} to OUT_FOR_DELIVERY`, `status=${r.status} at ${action}`);',
);

// 2. Remaining call sites of the renamed helper.
src = src.split('readyForPickup').join('sendOutForDelivery');

// 3. Section 5: the kitchen flow is accept -> serving -> dispatch.
swap(
  'section 5 steps',
  "  const steps = ['accept', 'preparing', 'ready', 'dispatch', 'complete'];",
  "  const steps = ['accept', 'preparing', 'dispatch'];",
);
swap(
  'section 5 final assertion',
  [
    "  const after = await req(`/kitchen/orders/${oid}`, { token: kitchen });",
    '  const d = un(after.data) || {};',
    '  const st = d.status || (d.order && d.order.status);',
    "  check(st === 'DELIVERED', 'created order reaches DELIVERED', `status=${st}`);",
    '  ctx.orderStatus = st;',
  ].join('\n'),
  [
    '',
    '  // The kitchen workflow stops at dispatch: only a driver completes a delivery.',
    '  const kitchenComplete = await req(`/kitchen/orders/${oid}/complete`, { method: \'POST\', token: kitchen });',
    "  check(kitchenComplete.status >= 400, 'kitchen cannot complete a delivery', `status=${kitchenComplete.status}`);",
    '',
    "  const after = await req(`/kitchen/orders/${oid}`, { token: kitchen });",
    '  const d = un(after.data) || {};',
    '  const st = d.status || (d.order && d.order.status);',
    "  check(st === 'OUT_FOR_DELIVERY', 'created order reaches OUT_FOR_DELIVERY', `status=${st}`);",
    '  ctx.orderStatus = st;',
  ].join('\n'),
);

// 4. Order A: the driver accepts a dispatched order, then completes it.
swap(
  'order A pickup -> accept/complete',
  [
    '    const pickup = await req(`/driver/deliveries/${orderA}/pickup`, { method: \'POST\', token: driver });',
    "    check(pickup.status === 200, 'driver picks up (READY -> OUT_FOR_DELIVERY)', `status=${pickup.status}`);",
    '',
    '    const complete = await req(`/driver/deliveries/${orderA}/complete`, { method: \'POST\', token: driver });',
    "    check(complete.status === 200, 'driver completes (OUT_FOR_DELIVERY -> DELIVERED)', `status=${complete.status}`);",
    '',
    '    const guard = await req(`/driver/deliveries/${orderA}/pickup`, { method: \'POST\', token: driver });',
    "    check(guard.status >= 400, 'driver cannot re-pickup a delivered order', `status=${guard.status}`);",
  ].join('\n'),
  [
    '    const complete = await req(`/driver/deliveries/${orderA}/complete`, { method: \'POST\', token: driver });',
    "    check(complete.status === 200, 'driver completes (OUT_FOR_DELIVERY -> DELIVERED)', `status=${complete.status}`);",
    '',
    '    const guard = await req(`/driver/deliveries/${orderA}/accept`, { method: \'POST\', token: driver });',
    "    check(guard.status >= 400, 'driver cannot re-accept a delivered order', `status=${guard.status}`);",
  ].join('\n'),
);

// 5. Order B: dispatched by an admin, so the driver goes straight to completion.
swap(
  'order B pickup removed',
  [
    '        const pickup = await req(`/driver/deliveries/${orderB}/pickup`, { method: \'POST\', token: driver });',
    "        check(pickup.status === 200, 'driver starts the dispatched delivery', `status=${pickup.status}`);",
    '        const complete = await req(`/driver/deliveries/${orderB}/complete`, { method: \'POST\', token: driver });',
  ].join('\n'),
  '        const complete = await req(`/driver/deliveries/${orderB}/complete`, { method: \'POST\', token: driver });',
);

// 6. Order C: issue reporting happens during an active delivery.
swap(
  'order C pickup removed',
  [
    '    await req(`/driver/deliveries/${orderC}/accept`, { method: \'POST\', token: driver });',
    '    await req(`/driver/deliveries/${orderC}/pickup`, { method: \'POST\', token: driver });',
  ].join('\n'),
  '    await req(`/driver/deliveries/${orderC}/accept`, { method: \'POST\', token: driver });',
);

fs.writeFileSync(file, src);
console.log(`\napplied=${ok} missing=${miss}`);

const check = fs.readFileSync(file, 'utf8');
console.log('remaining pickup/ready refs: ' + (check.match(/pickup|'ready'|to READY/g) || []).length);
console.log('sendOutForDelivery refs: ' + (check.match(/sendOutForDelivery/g) || []).length);
