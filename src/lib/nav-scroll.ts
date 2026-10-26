/** Horizontal scroll offset that brings an item fully into a scroller, keeping a gutter beside it.
 *  Item edges are in the scroller's content coordinates, so they do not change as it scrolls. */
export function revealScrollLeft(
  view: { readonly scrollLeft: number; readonly width: number },
  item: { readonly left: number; readonly right: number },
  gutter: number,
): number {
  if (item.left - gutter < view.scrollLeft) return Math.max(0, item.left - gutter)
  if (item.right + gutter > view.scrollLeft + view.width) return item.right + gutter - view.width
  return view.scrollLeft
}
