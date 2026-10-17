import { redirect } from "next/navigation";

/** Controllers admin UI is parked — keep the route dark and the sidebar entry as a ghost. */
export default function Page() {
  redirect("/admin");
}
