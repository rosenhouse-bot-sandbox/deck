export const BUTTON = { a: 0, b: 1, x: 2, y: 3, rt: 7, start: 9, down: 13, right: 15 };

// Replaces the browser's gamepads with ones the test drives through `window.fakePad`.
export async function installGamepads(page) {
  await page.addInitScript(() => {
    const pads = [null, null, null, null];
    navigator.getGamepads = () => pads;
    window.fakePad = (index, buttons = [], steer = 0) => {
      pads[index] = {
        index,
        connected: true,
        axes: [steer, 0],
        buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: buttons.includes(i), value: buttons.includes(i) ? 1 : 0 })),
      };
    };
  });
}

export const hold = (page, index, buttons, steer = 0) =>
  page.evaluate(([i, b, s]) => window.fakePad(i, b, s), [index, buttons, steer]);

export async function press(page, index, button) {
  await hold(page, index, [button]);
  await page.waitForTimeout(80);
  await hold(page, index, []);
  await page.waitForTimeout(80);
}
