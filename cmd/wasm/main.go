//go:build js && wasm

package main

import (
	"syscall/js"

	"github.com/jaibhasin/ClipMD/internal/converter"
)

func convert(_ js.Value, args []js.Value) (result any) {
	defer func() {
		if recover() != nil {
			result = map[string]any{"error": "This page could not be converted."}
		}
	}()
	if len(args) != 2 || args[0].Type() != js.TypeString || args[1].Type() != js.TypeString {
		return map[string]any{"error": "Expected HTML and a page base URL."}
	}
	markdown, err := converter.Convert(args[0].String(), args[1].String())
	if err != nil {
		return map[string]any{"error": err.Error()}
	}
	return map[string]any{"markdown": markdown}
}

func main() {
	js.Global().Set("clipmdConvert", js.FuncOf(convert))
	js.Global().Call("postMessage", map[string]any{"type": "ready"})
	select {}
}
