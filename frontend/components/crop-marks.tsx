/**
 * Print-style crop marks at the four corners of the parent element.
 * The parent must have `position: relative` (class `trim`).
 */
export function CropMarks() {
  return (
    <>
      <i className="crop tl" aria-hidden="true" />
      <i className="crop tr" aria-hidden="true" />
      <i className="crop bl" aria-hidden="true" />
      <i className="crop br" aria-hidden="true" />
    </>
  )
}
