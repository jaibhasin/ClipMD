package converter

import (
	"strings"
	"testing"
)

func TestConversion(t *testing.T) {
	tests := []struct{ name, html, want string }{
		{"heading and Unicode", "<h2>Résumé 学习</h2><p><strong>Important</strong></p>", "## Résumé 学习\n\n**Important**"},
		{"relative links", `<p><a href="../lesson?x=1#part">Lesson</a></p>`, `[Lesson](https://example.com/course/lesson?x=1#part)`},
		{"relative image", `<img src="images/chart.png" alt="Chart">`, `![Chart](https://example.com/course/unit/images/chart.png)`},
		{"external and mail links", `<a href="https://other.test/a">Other</a> <a href="mailto:a@example.com">Email</a>`, `[Other](https://other.test/a) [Email](mailto:a@example.com)`},
		{"checkbox", `<ul><li><input type="checkbox" checked>Done</li><li><input type="checkbox">Next</li></ul>`, "- [x] Done\n- [ ] Next"},
		{"highlighted code", `<pre><code class="language-js"><div>const x = 1;</div><div class="line-numbers">1</div><div>run(x);</div></code></pre>`, "```js\nconst x = 1;\nrun(x);\n```"},
		{"escaping", `<p>Literal **stars**</p>`, `Literal \*\*stars\*\*`},
		{"inline spacing", `<p><del>Old</del> <code>a ** b</code></p>`, "~~Old~~ `a ** b`"},
		{"inline backticks", "<p><code>a ```` b</code></p>", "`````a ```` b`````"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := Convert(test.html, "https://example.com/course/unit/page")
			if err != nil || got != test.want {
				t.Fatalf("got %q, error %v; want %q", got, err, test.want)
			}
		})
	}
}

func TestNestedListsAndTables(t *testing.T) {
	markdown, err := Convert(`<ul><li>Parent<ul><li>Child</li></ul></li></ul><table><tr><th>Name</th><th>Value</th></tr><tr><td>A</td><td>2</td></tr></table>`, "https://example.com/")
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"- Parent\n  - Child", "| Name | Value |", "| --- | --- |", "| A | 2 |"} {
		if !strings.Contains(markdown, want) {
			t.Fatalf("missing %q in %q", want, markdown)
		}
	}
}

func TestInvalidBaseURL(t *testing.T) {
	for _, base := range []string{"", "relative/path", "javascript:alert(1)", "https://%"} {
		if _, err := Convert("<p>Text</p>", base); err == nil {
			t.Fatalf("expected an error for base URL %q", base)
		}
	}
}
