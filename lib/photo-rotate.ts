// Scale needed so a w×h image rotated by `degrees` about its center still
// fully covers the original w×h frame — i.e. straightening a tilted photo
// without leaving empty wedges in the corners. 1 when not rotated.
export function rotationFillScale(width: number, height: number, degrees: number): number {
  if (!degrees || width <= 0 || height <= 0) return 1;
  const theta = (Math.abs(degrees) * Math.PI) / 180;
  const longRatio = Math.max(width / height, height / width);
  return Math.cos(theta) + longRatio * Math.sin(theta);
}
