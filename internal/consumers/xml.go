package consumers

import (
	"encoding/xml"
	"io"
	"strings"

	"github.com/seedz-ag/sdz-agent-go/internal/core"
)

// xmlNode is a generic element tree used to approximate xml2json's {object:true} output.
type xmlNode struct {
	XMLName xml.Name
	Attrs   []xml.Attr `xml:",any,attr"`
	Content []byte     `xml:",chardata"`
	Nodes   []xmlNode  `xml:",any"`
}

func (n xmlNode) name() string {
	if n.XMLName.Space != "" {
		// keep "prefix:local" when the prefix is recoverable; the parser only gives the namespace URI
		return n.XMLName.Local
	}
	return n.XMLName.Local
}

// xmlToJSON converts an XML document into a *core.Row: attributes and children become keys,
// repeated siblings become lists, text-only elements become strings, mixed text goes to "$t".
func xmlToJSON(data []byte) (*core.Row, error) {
	var root xmlNode
	if err := xml.Unmarshal(data, &root); err != nil {
		return nil, err
	}
	row := core.NewRow()
	row.Set(root.name(), convertElement(root))
	return row, nil
}

func convertElement(n xmlNode) any {
	text := strings.TrimSpace(string(n.Content))
	if len(n.Nodes) == 0 && len(n.Attrs) == 0 {
		return text
	}
	row := core.NewRow()
	for _, a := range n.Attrs {
		if a.Name.Space == "xmlns" || a.Name.Local == "xmlns" {
			continue
		}
		row.Set(a.Name.Local, a.Value)
	}
	groups := map[string][]any{}
	var order []string
	for _, child := range n.Nodes {
		name := child.name()
		if _, ok := groups[name]; !ok {
			order = append(order, name)
		}
		groups[name] = append(groups[name], convertElement(child))
	}
	for _, name := range order {
		items := groups[name]
		if len(items) == 1 {
			row.Set(name, items[0])
		} else {
			row.Set(name, items)
		}
	}
	if text != "" {
		row.Set("$t", text)
	}
	return row
}

// streamEntries yields one *core.Row per <entry> of an Atom/OData feed (port of convertEntryToObject).
func streamEntries(r io.Reader, fn func(*core.Row) error) error {
	dec := xml.NewDecoder(r)
	for {
		tok, err := dec.Token()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}
		start, ok := tok.(xml.StartElement)
		if !ok || start.Name.Local != "entry" {
			continue
		}
		var entry xmlNode
		if err := dec.DecodeElement(&entry, &start); err != nil {
			return err
		}
		if err := fn(convertEntry(entry)); err != nil {
			return err
		}
	}
}

func convertEntry(entry xmlNode) *core.Row {
	result := core.NewRow()
	for _, child := range entry.Nodes {
		if child.XMLName.Local != "content" {
			continue
		}
		for _, props := range child.Nodes {
			if props.XMLName.Local != "properties" {
				continue
			}
			for _, p := range props.Nodes {
				if len(p.Nodes) > 0 {
					result.Set(strings.ToUpper(p.XMLName.Local), convertElement(p))
				} else {
					result.Set(strings.ToUpper(p.XMLName.Local), strings.TrimSpace(string(p.Content)))
				}
			}
		}
	}
	for _, child := range entry.Nodes {
		if child.XMLName.Local == "content" {
			continue
		}
		key := strings.ToUpper(child.XMLName.Local)
		if _, exists := result.Get(key); exists {
			continue
		}
		if len(child.Nodes) > 0 {
			result.Set(key, convertElement(child))
		} else {
			result.Set(key, strings.TrimSpace(string(child.Content)))
		}
	}
	return result
}
