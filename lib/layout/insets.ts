/** Keep in sync with --atlas-nav-height / --atlas-bottom-gap in app/globals.css */
export const BOTTOM_NAV_HEIGHT_PX = 80;
export const BOTTOM_NAV_GAP_PX = 24;
export const COMPOSER_HEIGHT_PX = 68;
export const CONTENT_BOTTOM_INSET_PX = BOTTOM_NAV_HEIGHT_PX + BOTTOM_NAV_GAP_PX;

export function contentBottomInsetPx(safeAreaPx = 0): number {
  return CONTENT_BOTTOM_INSET_PX + safeAreaPx;
}

export function composerBottomInsetPx(safeAreaPx = 0): number {
  return CONTENT_BOTTOM_INSET_PX + COMPOSER_HEIGHT_PX + safeAreaPx;
}
