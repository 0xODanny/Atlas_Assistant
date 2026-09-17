/** Keep in sync with --atlas-bottom-nav-height / --atlas-bottom-gap in app/globals.css */
export const BOTTOM_NAV_HEIGHT_PX = 84;
export const BOTTOM_NAV_GAP_PX = 28;
export const CONTENT_BOTTOM_INSET_PX = BOTTOM_NAV_HEIGHT_PX + BOTTOM_NAV_GAP_PX;

export function contentBottomInsetPx(safeAreaPx = 0): number {
  return CONTENT_BOTTOM_INSET_PX + safeAreaPx;
}
