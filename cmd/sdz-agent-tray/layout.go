package main

import (
	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/layout"
)

// formLayout is a two-column grid: labels on the left, inputs stretched on the right.
func formLayout() fyne.Layout { return layout.NewFormLayout() }

func layoutSpacer() fyne.CanvasObject { return layout.NewSpacer() }
