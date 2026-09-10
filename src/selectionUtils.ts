/**
 * Compares two identifier arrays as sets, ignoring order and strictly
 * distinguishing between string and numeric identifiers (e.g. 1 !== '1').
 */
export function areIdentifierSetsEqual(
  a?: readonly (string | number)[],
  b?: readonly (string | number)[]
): boolean {
  if (a === b) return true;
  const aLen = a ? a.length : 0;
  const bLen = b ? b.length : 0;
  if (aLen === 0 && bLen === 0) return true;
  if (!a || !b) return false;

  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size !== setB.size) return false;
  for (const item of setA) {
    if (!setB.has(item)) return false;
  }
  return true;
}
