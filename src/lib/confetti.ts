import confetti from 'canvas-confetti';

// Fires confetti from both edges of the screen for a few seconds — used to
// celebrate the draft finishing.
export function fireDraftCompleteConfetti() {
  const duration = 3000;
  const end = Date.now() + duration;
  const colors = ['#22c55e', '#fbbf24', '#ffffff'];

  const frame = () => {
    confetti({
      particleCount: 3,
      angle: 60,
      spread: 55,
      startVelocity: 55,
      origin: { x: 0, y: 0.6 },
      colors,
    });
    confetti({
      particleCount: 3,
      angle: 120,
      spread: 55,
      startVelocity: 55,
      origin: { x: 1, y: 0.6 },
      colors,
    });

    if (Date.now() < end) requestAnimationFrame(frame);
  };

  frame();
}
