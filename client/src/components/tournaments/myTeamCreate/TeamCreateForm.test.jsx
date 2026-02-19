import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TeamCreateForm from "@/components/tournaments/myTeamCreate/TeamCreateForm";

describe("TeamCreateForm", () => {
  it("renders and submits form", async () => {
    const user = userEvent.setup();
    const onCreateTeam = vi.fn((e) => e.preventDefault());
    const setTeamName = vi.fn();
    const setTeamMaxMembers = vi.fn();
    const setTeamCountry = vi.fn();
    const onAvatarChange = vi.fn();

    render(
      <TeamCreateForm
        tm={{
          placeholders: { teamName: "Team name", country: "Country" },
          createTeam: "Create team",
        }}
        teamName=""
        setTeamName={setTeamName}
        teamMaxMembers={2}
        setTeamMaxMembers={setTeamMaxMembers}
        teamCountry=""
        setTeamCountry={setTeamCountry}
        teamCountries={[{ code: "US", label: "United States" }]}
        creatingTeam={false}
        onCreateTeam={onCreateTeam}
        onAvatarChange={onAvatarChange}
        teamAvatarPreview=""
      />
    );

    await user.type(screen.getByPlaceholderText("Team name"), "A");
    expect(setTeamName).toHaveBeenCalled();

    await user.selectOptions(screen.getAllByRole("combobox")[1], "US");
    expect(setTeamCountry).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Create team" }));
    expect(onCreateTeam).toHaveBeenCalled();
  });

  it("renders avatar preview", () => {
    render(
      <TeamCreateForm
        tm={{}}
        teamName="X"
        setTeamName={vi.fn()}
        teamMaxMembers={5}
        setTeamMaxMembers={vi.fn()}
        teamCountry=""
        setTeamCountry={vi.fn()}
        teamCountries={[]}
        creatingTeam={false}
        onCreateTeam={vi.fn()}
        onAvatarChange={vi.fn()}
        teamAvatarPreview="data:image/png;base64,abc"
      />
    );

    expect(screen.getByRole("img", { name: /Team avatar preview/i })).toBeInTheDocument();
  });
});
