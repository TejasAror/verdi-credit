// Mocha global setup: expose chai's `expect` so tests don't need per-file imports.
import { expect } from "chai";

(global as any).expect = expect;
