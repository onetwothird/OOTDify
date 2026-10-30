// Hold-then-fade bookkeeping for the outfit layer, keyed by item id so a late
// cut-out joining the outfit (and shifting the draw order) never lends one
// item's last mesh to another. Pure and native-free so it can run in a worklet.

export interface HoldState<M> {
  /** The last good mesh per item id. */
  mesh: Record<string, M>;
  /** When each held item's pose was lost; -1 while tracked. */
  lostAt: Record<string, number>;
}

/** One tracker frame: fresh fits replace held meshes; a missed fit keeps the old one and starts its fade clock. */
export function holdStep<M>(prev: HoldState<M>, fits: { id: string; mesh: M | null }[], now: number): HoldState<M> {
  "worklet";
  const mesh: Record<string, M> = {};
  const lostAt: Record<string, number> = {};
  for (let i = 0; i < fits.length; i++) {
    const { id, mesh: fit } = fits[i];
    if (fit !== null) {
      mesh[id] = fit;
      lostAt[id] = -1;
    } else if (Object.prototype.hasOwnProperty.call(prev.mesh, id)) {
      mesh[id] = prev.mesh[id];
      const lost = prev.lostAt[id];
      lostAt[id] = lost === undefined || lost < 0 ? now : lost;
    }
  }
  return { mesh, lostAt };
}
