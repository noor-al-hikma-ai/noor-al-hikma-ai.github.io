import { useEffect, useState } from "react";

export type Route = "paper" | "walkthrough" | "studio" | "sandbox" | "services" | "trust";
const ROUTES: Route[] = ["paper", "walkthrough", "studio", "sandbox", "services", "trust"];

function parse(): { route: Route; anchor?: string } {
  const h = window.location.hash.replace(/^#\/?/, "");
  const [path, anchor] = h.split("#");
  const r = (path || "paper") as Route;
  return { route: ROUTES.includes(r) ? r : "paper", anchor };
}

export function useRoute() {
  const [state, setState] = useState(parse);
  useEffect(() => {
    const on = () => setState(parse());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return state;
}

export function go(route: Route, anchor?: string) {
  window.location.hash = `/${route}${anchor ? "#" + anchor : ""}`;
}
