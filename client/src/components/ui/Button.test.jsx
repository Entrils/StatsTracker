import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Button from "@/components/ui/Button";

describe("Button", () => {
  it("renders children and handles click", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(<Button onClick={onClick}>Press me</Button>);
    await user.click(screen.getByRole("button", { name: "Press me" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("uses button type by default", () => {
    render(<Button>Default type</Button>);
    expect(screen.getByRole("button", { name: "Default type" })).toHaveAttribute(
      "type",
      "button"
    );
  });
});
