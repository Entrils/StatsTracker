import { render, screen } from "@testing-library/react";
import TrustMetaBar from "@/components/TrustMetaBar/TrustMetaBar";

describe("TrustMetaBar", () => {
  it("returns null when text is empty", () => {
    const { container } = render(<TrustMetaBar text="" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders text with custom className", () => {
    render(<TrustMetaBar text="Build status: stable" className="custom-meta" />);
    const node = screen.getByText("Build status: stable");
    expect(node).toBeInTheDocument();
    expect(node).toHaveClass("custom-meta");
  });
});
