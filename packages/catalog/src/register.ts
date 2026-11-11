/** Registers every premium generator. Imported for its side effect by the package entry point. */
import { registerGenerator, type Generator } from './parametric';
import { PREMIUM_GENERATORS } from './premium';

for (const [name, fn] of Object.entries(PREMIUM_GENERATORS)) registerGenerator(name, fn as Generator);
