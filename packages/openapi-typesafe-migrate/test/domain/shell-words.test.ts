import { describe, expect, it } from "vitest";
import { shellCommands } from "../../src/domain/shell-words.js";

/** The words of each command, by value. */
const values = (text: string): string[][] =>
  shellCommands(text).map((words) => words.map((word) => word.value));

describe("shellCommands", () => {
  it("shellCommands splits commands at control operators and line breaks", () => {
    expect(values("a b && c || d; e | f & g\nh (i) `j`")).toEqual([
      ["a", "b"],
      ["c"],
      ["d"],
      ["e"],
      ["f"],
      ["g"],
      ["h"],
      ["i"],
      ["j"],
    ]);
  });

  it("shellCommands joins lines continued with a backslash into one command", () => {
    expect(values("a \\\n  -b \\\r\n  c\nd")).toEqual([["a", "-b", "c"], ["d"]]);
  });

  it("shellCommands removes quotes and escapes from word values", () => {
    expect(values(`a 'b c' "d \\" \\$e \\x" f\\ g h"i"'j'`)[0]).toEqual([
      "a",
      "b c",
      'd " $e \\x',
      "f g",
      "hij",
    ]);
  });

  it("shellCommands keeps the offsets and the raw text of each word", () => {
    const [command] = shellCommands('x "y z"');

    expect(command).toEqual([
      { start: 0, end: 1, value: "x", raw: "x" },
      { start: 2, end: 7, value: "y z", raw: '"y z"' },
    ]);
  });

  it("shellCommands skips comments that start a word, and breaks words at redirections", () => {
    expect(values("a # b c\nd#e >out <in")).toEqual([["a"], ["d#e", "out", "in"]]);
  });

  it("shellCommands reads a quoted command line as commands, with offsets in the outer text", () => {
    const commands = shellCommands(`sh -c "x -y && z" 'q r'`);

    expect(commands.map((words) => words.map((word) => word.value))).toEqual([
      ["sh", "-c", "x -y && z", "q r"],
      ["x", "-y"],
      ["z"],
      ["q", "r"],
    ]);
    expect(commands[1]?.[0]).toMatchObject({ start: 7, end: 8, raw: "x" });
  });

  it("shellCommands does not read a word as a command line unless it is one quoted string", () => {
    expect(values(`a"b c" "d e`)).toEqual([["ab c", "d e"]]);
  });

  it("shellCommands joins a line continued inside double quotes, and ends a last comment", () => {
    expect(values('a "b\\\nc" # end')).toEqual([["a", "bc"]]);
  });

  it("shellCommands reads unclosed quotes and a trailing backslash to the end", () => {
    expect(values("a 'b c")).toEqual([["a", "b c"]]);
    expect(values("a \\")).toEqual([["a", "\\"]]);
    expect(values("")).toEqual([]);
  });

  it("shellCommands reads the command after a reserved word in command position", () => {
    const text =
      "if a; then b -x; elif c; else d; fi; while ! e; do { f; }; done; until g; do h; done";

    expect(values(text)).toEqual([["a"], ["b", "-x"], ["c"], ["d"], ["e"], ["f"], ["g"], ["h"]]);
  });

  it("shellCommands reads no command in a for, select or case clause or a [[ test", () => {
    const text = "for f in a b; do c $f; done\ncase $x in d) e;; esac\n[[ -n y ]] && g";

    expect(values(text)).toEqual([["c", "$f"], ["e"], ["g"]]);
    expect(values("select s in a b; do c; done; function h { i; }")).toEqual([["c"], ["i"]]);
  });

  it("shellCommands keeps reserved words that are quoted or not in command position", () => {
    expect(values(`"if" a; echo then fi; 'do' b`)).toEqual([
      ["if", "a"],
      ["echo", "then", "fi"],
      ["do", "b"],
    ]);
  });
});

describe("shellCommands and here-documents", () => {
  it("shellCommands skips the body of a here-document, whose quotes are data", () => {
    const text = "cat > n <<'NOTE'\nDon't edit\nNOTE\nnpx gen a";

    expect(values(text)).toEqual([
      ["cat", "n"],
      ["npx", "gen", "a"],
    ]);
  });

  it("shellCommands ends a <<- body at a delimiter line indented with tabs", () => {
    const text = "cat <<-EOF\n\tit's\n\tEOF\nnext";

    expect(values(text)).toEqual([["cat"], ["next"]]);
  });

  it("shellCommands reads the bodies of two here-documents of one line in order", () => {
    const text = 'a <<A 3<<"B" b\nx\'\nA\ny"\nB\nnext\r\n';

    expect(values(text)).toEqual([["a", "3", "b"], ["next"]]);
  });

  it("shellCommands takes a delimiter line with a carriage return", () => {
    expect(values("cat <<E\r\nit's\r\nE\r\nnext")).toEqual([["cat"], ["next"]]);
  });

  it("shellCommands reads a body without its delimiter line to the end", () => {
    expect(values("cat <<E\nit's\nnot a command")).toEqual([["cat"]]);
  });

  it("shellCommands reads the commands of a here-document a shell runs", () => {
    const text = "bash -e <<'EOF'\nnpx gen a\nEOF\nRUN --mount=x <<EOF\nnpx gen b\nEOF";

    expect(values(text)).toEqual([
      ["bash", "-e"],
      ["npx", "gen", "a"],
      ["RUN", "--mount=x"],
      ["npx", "gen", "b"],
    ]);
  });

  it("shellCommands reads the here-document of RUN that a shell after its options runs", () => {
    expect(
      values("RUN --mount=x <<EOT bash -e\nnpx gen a\nEOT\nRUN <<EOT cat\nnpx gen b\nEOT"),
    ).toEqual([
      ["RUN", "--mount=x", "bash", "-e"],
      ["npx", "gen", "a"],
      ["RUN", "cat"],
    ]);
  });

  it("shellCommands reads a here-document that cat gives a shell through a pipe", () => {
    expect(values("cat <<EOF | sh -s\nnpx gen a\nEOF")).toEqual([
      ["cat"],
      ["sh", "-s"],
      ["npx", "gen", "a"],
    ]);
  });

  it.each([
    ["cat <<EOF || sh\nnpx gen\nEOF", [["cat"], ["sh"]]],
    ["cat <<EOF | sh gen.sh\nnpx gen\nEOF", [["cat"], ["sh", "gen.sh"]]],
    ["cat <<EOF; sh\nnpx gen\nEOF", [["cat"], ["sh"]]],
    ["cat a.txt <<EOF | sh\nnpx gen\nEOF", [["cat", "a.txt"], ["sh"]]],
    ["tee <<EOF | sh\nnpx gen\nEOF", [["tee"], ["sh"]]],
    ["cat <<EOF\nnpx gen\nEOF", [["cat"]]],
  ])("shellCommands reads the here-document of %j as data", (text, commands) => {
    expect(values(text)).toEqual(commands);
  });

  it("shellCommands reads a here-document as data when a shell runs a script file", () => {
    expect(values("bash gen.sh <<EOF\nnpx gen\nEOF")).toEqual([["bash", "gen.sh"]]);
  });

  it("shellCommands keeps the offsets of the commands in a here-document", () => {
    const text = "sh <<EOF\nnpx gen\nEOF";
    const word = shellCommands(text)[1]?.[1];

    expect(text.slice(word?.start, word?.end)).toBe("gen");
  });

  it("shellCommands reads an arithmetic expansion as one word part, so its << is a shift", () => {
    expect(values("x=$((1<<2)) y=$(( (3) * 2 ))z\nnpx gen a.yaml")).toEqual([
      ["x=$((1<<2))", "y=$(( (3) * 2 ))z"],
      ["npx", "gen", "a.yaml"],
    ]);
  });

  it("shellCommands reads an unclosed arithmetic expansion as characters and separators", () => {
    expect(values("echo $((1 + 2")).toEqual([
      ["echo", "$"],
      ["1", "+", "2"],
    ]);
  });

  it("shellCommands reads a here-string and an empty delimiter as words", () => {
    expect(values("cat <<<'it''s' x\nnext")).toEqual([["cat", "its", "x"], ["next"]]);
    expect(values("cat << \nnext")).toEqual([["cat"], ["next"]]);
  });
});
