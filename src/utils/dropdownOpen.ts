type CloseFn = () => void;

let activeClose: CloseFn | null = null;

/** Close any other open inline dropdown, then register this one as active. */
export function claimDropdownOpen(close: CloseFn): void {
  if (activeClose && activeClose !== close) {
    try {
      activeClose();
    } catch {
      // ignore
    }
  }
  activeClose = close;
}

/** Release the active claim when this dropdown closes or unmounts. */
export function releaseDropdownOpen(close: CloseFn): void {
  if (activeClose === close) {
    activeClose = null;
  }
}
