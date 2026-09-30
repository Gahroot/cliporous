#!/usr/bin/env node
/** Same native evidence engine, restricted to causal kinds/relay presets; full silent movies by default. */
import { runVerification } from './verify-motion.mjs';

runVerification(process.argv.slice(2), 'systems').catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
