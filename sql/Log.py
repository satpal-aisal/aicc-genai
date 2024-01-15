import os
import requests
import pyodbc
import pandas as pd
import struct
import logging
from utils import (send_email)

class Log:

    def __init__(self):
        # for linux
        driver = "{ODBC Driver 18 for SQL Server}"
        # for windows
        # driver = "{SQL Server}"
        server = os.getenv("DB_SERVER")
        database = os.getenv("DB_NAME")
        uid = os.getenv("DB_UID")
        pwd = os.getenv("DB_PASSWORD")
        connection_string = "Driver="+driver+";Server="+server+";Database="+database+";UID="+uid+";PWD="+pwd+";"
        print("connection_string:",connection_string)
        try:
            self.conn = pyodbc.connect(connection_string) 
            print()
        except Exception as e:
            send_email(subject="JDE Exception in database connection",body="Exception: "+str(e))
            logging.debug("JDE Exception in connection",e)
            
    def insert_data(self,question,answer, username, origin):
        try:
            cursor = self.conn.cursor()
            sql = """
            SET NOCOUNT ON;
            DECLARE @table_identity TABLE(id int);
            INSERT INTO chat_history_jde (question, answer, username,origin) OUTPUT inserted.id INTO @table_identity(id) VALUES (?, ?, ?, ?);
            SELECT id FROM @table_identity;"""
            cursor.execute(sql,question,answer,username, origin)
            inserted_id = cursor.fetchone()[0]
            cursor.close()
            self.conn.commit()
            return inserted_id
        except Exception as e:
            send_email(subject="JDE Exception while inserting data", body="Exception: "+str(e))
            logging.debug("Exception in Insert",e)
        finally:
            self.conn.close()

    

    def updateIsLike(self,val,id,comment=""):
        try:
            cursor = self.conn.cursor()
            sql = "UPDATE chat_history_jde SET isLike = ?, comment=? WHERE id = ?"
            cursor.execute(sql,val,comment,id)
            cursor.close()
            self.conn.commit()
        except Exception as e:
            send_email(subject="JDE Exception while like and dislike",body="Exception: "+str(e))
            logging.debug("JDE Exception in Update",e)
        finally:
            self.conn.close()