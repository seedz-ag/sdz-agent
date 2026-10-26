package api

// Setting and its children mirror the /settings payload (PascalCase keys).
type Credentials struct {
	Username string `json:"Username"`
	Password string `json:"Password"`
}

type Map struct {
	From string `json:"From"`
	To   string `json:"To"`
}

type Parameter struct {
	Key   string `json:"Key"`
	Value string `json:"Value"`
}

type Query struct {
	Command string `json:"Command"`
	Entity  string `json:"Entity"`
	ID      string `json:"Id"`
}

type Schedule struct {
	CronExpression string `json:"CronExpression"`
}

type Schema struct {
	APIResource string `json:"ApiResource"`
	Entity      string `json:"Entity"`
	InputFormat string `json:"InputFormat"` // AGENT | JSON | CSV | XLS | XLSX | PARQUET
	Maps        []Map  `json:"Maps"`
}

type Security struct {
	Config      string       `json:"Config"`
	Credentials *Credentials `json:"Credentials"`
	Type        string       `json:"Type"`
}

type Setting struct {
	Channel    string      `json:"Channel"`
	DataSource string      `json:"DataSource"`
	Parameters []Parameter `json:"Parameters"`
	Queries    []Query     `json:"Queries"`
	Schedules  []Schedule  `json:"Schedules"`
	Schemas    []Schema    `json:"Schemas"`
	Security   *Security   `json:"Security"`
	TenantID   string      `json:"TenantId"`
	ID         string      `json:"Id"`
}

func (s *Setting) Parameter(key string) string {
	for _, p := range s.Parameters {
		if p.Key == key {
			return p.Value
		}
	}
	return ""
}

func (s *Setting) HasParameter(key string) bool {
	for _, p := range s.Parameters {
		if p.Key == key {
			return true
		}
	}
	return false
}

// CommandMessage is one frame of the /commands stream.
type CommandMessage struct {
	Command   string `json:"command"`
	Arguments any    `json:"arguments"`
	Sender    string `json:"sender"`
}
