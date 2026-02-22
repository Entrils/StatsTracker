import StateMessage from "@/components/StateMessage/StateMessage";

export default function PageState({
  loading = false,
  error = "",
  empty = false,
  loadingText = "Loading...",
  errorText = "Something went wrong",
  emptyText = "No data",
  renderLoading = null,
  children,
}) {
  if (loading) {
    return typeof renderLoading === "function"
      ? renderLoading()
      : <StateMessage text={loadingText} tone="loading" />;
  }
  if (error) {
    return <StateMessage text={errorText || error} tone="error" />;
  }
  if (empty) {
    return <StateMessage text={emptyText} tone="empty" />;
  }
  return children;
}
