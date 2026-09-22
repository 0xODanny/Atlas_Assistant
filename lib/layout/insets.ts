/** Keep in sync with --atlas-nav-height / --atlas-bottom-gap in app/globals.css */
export const BOTTOM_NAV_HEIGHT_PX = 52;
export const BOTTOM_NAV_GAP_PX = 12;
export const COMPOSER_GAP_PX = 8;
export const COMPOSER_HEIGHT_PX = 56;
export const CONTENT_BOTTOM_INSET_PX = BOTTOM_NAV_HEIGHT_PX + BOTTOM_NAV_GAP_PX;

export function contentBottomInsetPx(safeAreaPx = 0): number {
  return CONTENT_BOTTOM_INSET_PX + safeAreaPx;
}

export function composerBottomInsetPx(safeAreaPx = 0): number {
  return BOTTOM_NAV_HEIGHT_PX + COMPOSER_GAP_PX + COMPOSER_HEIGHT_PX + safeAreaPx;
}
