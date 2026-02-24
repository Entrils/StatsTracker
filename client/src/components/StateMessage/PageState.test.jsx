import { render, screen } from "@testing-library/react";
import PageState from "@/components/StateMessage/PageState";

describe("PageState", () => {
  it("renders loading message", () => {
    render(<PageState loading loadingText="Loading test..." />);
    expect(screen.getByText("Loading test...")).toBeInTheDocument();
  });

  it("renders error state", () => {
    render(<PageState error="boom" errorText="Error test" />);
    expect(screen.getByText("Error test")).toBeInTheDocument();
  });

  it("renders empty state", () => {
    render(<PageState empty emptyText="Nothing here" />);
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });

  it("renders children when no state is active", () => {
    render(
      <PageState>
        <div>Content visible</div>
      </PageState>
    );
    expect(screen.getByText("Content visible")).toBeInTheDocument();
  });
});
