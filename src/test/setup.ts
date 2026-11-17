import "@/test/storage";
import "fake-indexeddb/auto";
import { configureSimulation } from "@/demo/simulate";

// Tests run with no delay and no random failures.
configureSimulation({ minMs: 0, maxMs: 0, failureRate: 0 });
