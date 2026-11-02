// Calls the deprecated stringToAST twice; the test checks that Node warns once (task 6.5).
import { stringToAST } from "../../src/index.js";

stringToAST("type A = 1;");
stringToAST("type B = 2;");
