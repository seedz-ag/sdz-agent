package drivers

import "github.com/seedz-ag/sdz-agent-go/internal/data"

func init() {
	data.Register("FIREBIRD", newFirebird)
	data.Register("MYSQL", newMysql)
	data.Register("MSSQL", newMssql)
	data.Register("MONGODB", newMongo)
	data.Register("ODBC", newOdbc)
	data.Register("ORACLE", newOracle)
	data.Register("POSTGRES", newPostgres("POSTGRES"))
	data.Register("REDSHIFT", newPostgres("REDSHIFT"))
}
