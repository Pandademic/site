import React, { Fragment, useEffect, useState, createRef } from "react";
import Layout from "@theme/Layout";
import CodeBlock from "@theme/CodeBlock";
import { EditorState, EditorView, basicSetup } from "@codemirror/basic-setup";
import { python } from "@codemirror/lang-python";
import styles from "./playground.module.css";
import BrowserOnly from "@docusaurus/BrowserOnly";
import { format as prettyFormat } from "pretty-format";

function compile(input) {
  input = input.replace(
    /("(?:\\["\\]|[^"\\])*"|'(?:\\['\\]|[^'\\])*')|###[^]*?###|#.*/gm,
    (_, string) => (string ? string.replace(/\n/g, "\\n") : "")
  );
  let lines = input.split("\n");
  let comment = false;
  let indents = [];
  let output = "";
  for (let line of lines) {
    let statement = line.match(
      /^(\s*)(if|else|switch|try|catch|(?:async\s+)?function\*?|class|do|while|for)\s+(.+)/
    );
    if (statement) {
      let [, spaces, name, args] = statement;
      indents.unshift(spaces.length);
      output += `${spaces}${name} ${
        /function|try|class/.test(name) ? args : `(${args})`
      } {\n`;
    } else {
      let spaces = line.match(/^\s*/)[0].length;
      for (let indent of [...indents]) {
        if (indent < spaces) break;
        output += `${" ".repeat(indent)}}\n`;
        indents.shift();
      }
      output +=
        line
          .replace(
            /^(\s*)import\s([^]+?)\sfrom/,
            (_, ws, names) => ws + "import {" + names + "} from"
          )
          .replace(
            /^(\s*)(local\s|global\s)?([\w\s,=]+)=(.*)/,
            (_, ws, keyword, start, end) => {
              let code = "";
              let vars = start.split("=");
              // declare variables
              code +=
                ws +
                // choose the right keyword(let or var)
                (keyword == "local" ? "let" : "var") +
                " " +
                vars
                  .map((v) => (~v.indexOf(",") ? "[" + v + "]" : v))
                  .join("=");
              // assign values
              code += "=$assign(" + end + ")";
              return code;

              /*return `${
              vars.length > 1 ? `${ws}${keyword}${vars.slice(1).join(",")}\n` : ""
            }${ws}${keyword}${vars
              .map((a) => (~a.indexOf(",") ? `[${a}]` : a))
              .join("=")}=$assign(${end})`;
          */
            }
          ) + "\n";
    }
  }
  return output;
}

let sucrase =
  "https://cdn.skypack.dev/pin/sucrase@v3.20.3-gZX9cgIr2LXp7bQ6YAVm/mode=imports,min/optimized/sucrase.js";

function CodeEditor() {
  let parent = createRef();
  let [mounted, setMounted] = useState(false);
  let [code, setCode] = useState([]);
  window.setCode = setCode;
  window.code = code;

  useEffect(() => {
    if (mounted) return;
    setMounted(true);
    let Import = new Function("url", "return import(url)");
    Import(sucrase);
    let print = (window.print = (...args) => {
      window.setCode([...window.code, args.map(prettyFormat).join(" ")]);

      return console.log(...args);
    });

    window.$assign = (...args) => (args.length == 1 ? args[0] : args);

    window.require = (path) => {
      return {
        standard: {
          float: (v) => +v,
          number: (v) => +v,
          int: (v) => Math.floor(+v),
          string: (v) => v + "",
          type: (v) => typeof v,
          print,
        },
      }[path];
    };

    let run = (doc) => {
      window.location.hash = encodeURIComponent(doc);
      window.setCode([]);
      try {
        Import(sucrase)
          .then(({ transform }) => {
            let fn = new Function(
              transform(compile(doc), {
                transforms: ["typescript", "imports"],
              }).code
            );
            fn();
          })
          .catch((error) => {
            print(error);
          });
      } catch (error) {
        print(error);
      }
    };
    let editor = new EditorView({
      state: EditorState.create({
        doc:
          decodeURIComponent(window.location.hash.slice(1)) ||
          `import print from 'standard'

if 'Unv is awesome!'
    print('Hello World!')
# keep editing for live results
`,
        extensions: [
          basicSetup,
          python(),
          EditorView.theme({
            "&": { height: "40vh" },
            ".cm-scroller": { overflow: "auto" },
          }),
          EditorView.updateListener.of((v) => {
            if (v.docChanged) run(editor.state.doc.toString());
          }),
        ],
      }),
      parent: parent.current,
    });
    run(editor.state.doc.toString());
  }, []);
  return (
    <>
      <div ref={parent}></div>
      <div className={styles.preview}>
        {code.map((c, i) => (
          <CodeBlock key={i} className="language-js">
            {c}
          </CodeBlock>
        ))}
      </div>
    </>
  );
}

export default function Playground() {
  return (
    <Layout>
      <div className={"container"}>
        <h1>Playground</h1>
        <div className={styles.playground}>
          <BrowserOnly fallback={<div>Loading...</div>}>
            {() => {
              return <CodeEditor />;
            }}
          </BrowserOnly>
        </div>
      </div>
    </Layout>
  );
}
