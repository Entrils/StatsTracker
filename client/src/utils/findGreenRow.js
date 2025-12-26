export function findGreenRow(cv, srcMat) {
  const hsv = new cv.Mat();
  cv.cvtColor(srcMat, hsv, cv.COLOR_RGBA2RGB);
  cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);

  const lowerGreen = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [35, 40, 40, 0]);
  const upperGreen = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [85, 255, 255, 255]);

  const mask = new cv.Mat();
  cv.inRange(hsv, lowerGreen, upperGreen, mask);

  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  let bestRect = null;
  let maxWidth = 0;

  for (let i = 0; i < contours.size(); i++) {
    const cnt = contours.get(i);
    const rect = cv.boundingRect(cnt);

    if (rect.width > maxWidth && rect.height < rect.width) {
      maxWidth = rect.width;
      bestRect = rect;
    }
  }

  hsv.delete();
  lowerGreen.delete();
  upperGreen.delete();
  mask.delete();
  contours.delete();
  hierarchy.delete();

  return bestRect;
}
