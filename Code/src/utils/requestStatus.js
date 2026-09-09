export function getRequestStatusLabel(status) {
  if (status === "Waiting for More Information") return "Returned to Requester";
  return status || "No status";
}
