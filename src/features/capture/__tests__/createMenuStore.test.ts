import { useCreateMenuStore } from "../createMenuStore";

describe("createMenuStore", () => {
  beforeEach(() => useCreateMenuStore.setState({ open: false }));

  it("toggles open and closed", () => {
    useCreateMenuStore.getState().toggle();
    expect(useCreateMenuStore.getState().open).toBe(true);
    useCreateMenuStore.getState().toggle();
    expect(useCreateMenuStore.getState().open).toBe(false);
  });

  it("close always closes", () => {
    useCreateMenuStore.setState({ open: true });
    useCreateMenuStore.getState().close();
    useCreateMenuStore.getState().close();
    expect(useCreateMenuStore.getState().open).toBe(false);
  });
});
