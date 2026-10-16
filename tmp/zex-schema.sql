CREATE TABLE channels(id INTEGER PRIMARY KEY,name TEXT,type INTEGER,base_url TEXT,models TEXT,"group" TEXT,status INTEGER,key TEXT,model_mapping TEXT,priority INTEGER,weight INTEGER,created_time INTEGER);
CREATE TABLE vendors(id INTEGER PRIMARY KEY,name TEXT,icon TEXT,status INTEGER,created_time INTEGER,deleted_at TEXT);
CREATE TABLE models(id INTEGER PRIMARY KEY,model_name TEXT,description TEXT,icon TEXT,vendor_id INTEGER,tags TEXT,endpoints TEXT,status INTEGER,sync_official INTEGER,deleted_at TEXT,updated_time INTEGER,created_time INTEGER);
CREATE TABLE abilities("group" TEXT,model TEXT,channel_id INTEGER,enabled INTEGER,priority INTEGER,weight INTEGER);
CREATE TABLE options(key TEXT PRIMARY KEY,value TEXT);
CREATE TABLE users(id INTEGER PRIMARY KEY,username TEXT,quota INTEGER,used_quota INTEGER);
CREATE TABLE tokens(id INTEGER PRIMARY KEY,user_id INTEGER,"key" TEXT,remain_quota INTEGER,used_quota INTEGER,"group" TEXT,model_limits TEXT);
CREATE TABLE logs(id INTEGER PRIMARY KEY,user_id INTEGER,model_name TEXT,quota INTEGER,type INTEGER);
