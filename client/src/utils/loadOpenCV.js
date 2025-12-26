export function waitForOpenCV() {
  return new Promise((resolve) => {
    if (window.cv && window.cv.imread) {
      resolve(window.cv);
    } else {
      window.Module = {
        onRuntimeInitialized() {
          resolve(window.cv);
        },
      };
    }
  });
}
