import "./element.ts";
import * as adapters from "./adapters/index.ts";
import { ChatWidget } from "./ui/widget.ts";

(ChatWidget as unknown as { adapters: typeof adapters }).adapters = adapters;

export default ChatWidget;
