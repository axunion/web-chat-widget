import "./element.ts";
import * as adapters from "./adapters/index.ts";
import {
	createLocalStorageStore,
	createMemoryStore,
	createSessionStorageStore,
} from "./core/store.ts";
import { ChatWidget } from "./ui/widget.ts";

const stores = {
	createMemoryStore,
	createLocalStorageStore,
	createSessionStorageStore,
};

const target = ChatWidget as unknown as {
	adapters: typeof adapters;
	stores: typeof stores;
};
target.adapters = adapters;
target.stores = stores;

export default ChatWidget;
