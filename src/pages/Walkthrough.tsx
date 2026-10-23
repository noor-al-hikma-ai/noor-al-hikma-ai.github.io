import { StoryDeck } from "../components/StoryDeck";
import { useRoute } from "../router";

// "How it works": the landing narrative as full-screen slides. The slide index
// lives in the URL (#/walkthrough#3) so deep links and Back work.
export default function Walkthrough() {
  const { anchor } = useRoute();
  const start = parseInt(anchor ?? "0", 10) || 0;
  return <StoryDeck fullscreen start={start} onIndex={(i) => history.replaceState(null, "", `#/walkthrough#${i}`)} />;
}
