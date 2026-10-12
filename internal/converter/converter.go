// Package converter configures the upstream Firecrawl converter for ClipMD.
package converter

import (
	"fmt"
	"net/url"
	"strings"

	"github.com/PuerkitoBio/goquery"
	md "github.com/firecrawl/html-to-markdown"
	"github.com/firecrawl/html-to-markdown/plugin"
)

// Convert keeps Firecrawl's conversion rules and resolves links against the
// captured document's full base URL, including its path and scheme.
func Convert(html, baseURL string) (string, error) {
	base, err := url.Parse(baseURL)
	if err != nil || base.Host == "" || (base.Scheme != "http" && base.Scheme != "https") {
		return "", fmt.Errorf("invalid page base URL")
	}

	converter := md.NewConverter("", true, &md.Options{
		CodeBlockStyle: "fenced",
		GetAbsoluteURL: func(_ *goquery.Selection, rawURL, _ string) string {
			link, err := url.Parse(strings.TrimSpace(rawURL))
			if err != nil {
				return rawURL
			}
			return base.ResolveReference(link).String()
		},
	})
	converter.Use(plugin.GitHubFlavored())
	converter.Use(plugin.RobustCodeBlock())
	return converter.ConvertString(html)
}
