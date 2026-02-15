import { render, screen, waitFor } from "@testing-library/react";
import { useAuth, AuthProvider } from "@/auth/AuthContext";

const { onAuthStateChangedMock } = vi.hoisted(() => ({
  onAuthStateChangedMock: vi.fn(),
}));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (...args) => onAuthStateChangedMock(...args),
}));

vi.mock("@/firebase", () => ({ auth: {} }));

function Probe() {
  const { user, claims, loading } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="uid">{user?.uid || ""}</span>
      <span data-testid="admin">{String(Boolean(claims?.admin))}</span>
    </div>
  );
}

describe("AuthProvider", () => {
  beforeEach(() => {
    delete window.__FP_UID;
    onAuthStateChangedMock.mockReset();
  });

  it("handles guest state and clears global uid", async () => {
    window.__FP_UID = "old";
    onAuthStateChangedMock.mockImplementation((_auth, cb) => {
      cb(null);
      return () => {};
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("false");
      expect(screen.getByTestId("uid")).toHaveTextContent("");
    });
    expect(window.__FP_UID).toBeUndefined();
  });

  it("sets user claims and global uid on login", async () => {
    const firebaseUser = {
      uid: "discord:1",
      getIdTokenResult: vi.fn().mockResolvedValue({ claims: { admin: true } }),
    };
    onAuthStateChangedMock.mockImplementation((_auth, cb) => {
      cb(firebaseUser);
      return () => {};
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("uid")).toHaveTextContent("discord:1");
      expect(screen.getByTestId("admin")).toHaveTextContent("true");
    });
    expect(window.__FP_UID).toBe("discord:1");
  });
});
