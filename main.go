package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"os"
	"path/filepath"
	"sync"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/websocket/v2"

	"go/ast"
	"go/parser"
	"go/token"
)

type DAPClient struct {
	conn        net.Conn
	mu          sync.Mutex
	seq         int
	programPath string
}

func main() {
	app := fiber.New()

	// Sirve archivos estáticos desde la carpeta "static"
	app.Static("/", "./static")

	// Ruta para servir archivos fuente
	app.Get("/source", func(c *fiber.Ctx) error {
		filePath := c.Query("filePath")
		data, err := os.ReadFile(filePath)
		if err != nil {
			return c.Status(500).SendString("Error al leer el archivo: " + err.Error())
		}
		return c.SendString(string(data))
	})

	app.Get("/functions", functionsHandler)

	// Maneja la conexión WebSocket
	app.Get("/ws", websocket.New(func(c *websocket.Conn) {
		defer c.Close()

		var dapClient *DAPClient
		var dapResponses chan string

		// Maneja mensajes desde el cliente WebSocket
		for {
			_, msg, err := c.ReadMessage()
			if err != nil {
				fmt.Println("Error al leer mensaje WebSocket:", err)
				break
			}

			var clientMsg map[string]interface{}
			if err := json.Unmarshal(msg, &clientMsg); err != nil {
				c.WriteMessage(websocket.TextMessage, []byte("Mensaje inválido"))
				continue
			}

			command, ok := clientMsg["command"].(string)
			if !ok {
				c.WriteMessage(websocket.TextMessage, []byte("Comando inválido"))
				continue
			}

			switch command {
			case "connect":
				address := clientMsg["address"].(string)
				port := clientMsg["port"].(string)
				programPath := clientMsg["programPath"].(string)

				conn, err := net.Dial("tcp", address+":"+port)
				if err != nil {
					c.WriteMessage(websocket.TextMessage, []byte("Error al conectar con el servidor DAP: "+err.Error()))
					continue
				}

				dapClient = &DAPClient{
					conn:        conn,
					seq:         0,
					programPath: programPath,
				}
				dapResponses = make(chan string)
				go dapClient.listenDAPResponses(dapResponses, c)

				c.WriteMessage(websocket.TextMessage, []byte("Conectado al servidor DAP"))

			case "disconnect":
				if dapClient == nil {
					c.WriteMessage(websocket.TextMessage, []byte("No hay conexión activa para desconectar"))
					continue
				}
				dapClient.conn.Close()
				dapClient = nil
				c.WriteMessage(websocket.TextMessage, []byte("Desconectado del servidor DAP"))

			case "getGoFiles":
				if dapClient == nil {
					c.WriteMessage(websocket.TextMessage, []byte("No conectado al servidor DAP"))
					continue
				}
				files, err := getGoFiles(dapClient.programPath)
				if err != nil {
					c.WriteMessage(websocket.TextMessage, []byte("Error al obtener la lista de archivos: "+err.Error()))
					continue
				}
				filesJSON, err := json.Marshal(files)
				if err != nil {
					c.WriteMessage(websocket.TextMessage, []byte("Error al serializar la lista de archivos"))
					continue
				}
				// Enviar la lista de archivos al cliente
				c.WriteMessage(websocket.TextMessage, filesJSON)

			default:
				// Reenviar cualquier otra solicitud DAP al servidor DAP
				if dapClient == nil {
					c.WriteMessage(websocket.TextMessage, []byte("No conectado al servidor DAP"))
					continue
				}
				dapClient.mu.Lock()
				dapClient.seq++
				clientMsg["seq"] = dapClient.seq
				dapClient.sendRequest(clientMsg)
				dapClient.mu.Unlock()
			}
		}
	}))

	// Inicia el servidor en el puerto 3000
	app.Listen(":3000")
}

// Obtiene la lista de archivos Go en el directorio del programa
func getGoFiles(programPath string) ([]string, error) {
	var files []string
	programDir := filepath.Dir(programPath)
	err := filepath.Walk(programDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if !info.IsDir() && filepath.Ext(path) == ".go" {
			absPath, err := filepath.Abs(path)
			if err != nil {
				return err
			}
			files = append(files, absPath)
		}
		return nil
	})
	return files, err
}

// Envía solicitudes al servidor DAP
func (client *DAPClient) sendRequest(req interface{}) error {
	data, err := json.Marshal(req)
	if err != nil {
		return err
	}

	log.Println("Send:", string(data))
	header := fmt.Sprintf("Content-Length: %d\r\n\r\n", len(data))
	client.conn.Write([]byte(header))
	client.conn.Write(data)
	return nil
}

// Escucha las respuestas del servidor DAP y las envía al cliente WebSocket
func (client *DAPClient) listenDAPResponses(responses chan<- string, c *websocket.Conn) {
	reader := bufio.NewReader(client.conn)
	for {
		// Lee el encabezado
		header, err := reader.ReadString('\n')
		if err != nil {
			fmt.Println("Error al leer encabezado DAP:", err)
			break
		}
		if header == "" || header == "\n" || header == "\r\n" {
			continue
		}

		var contentLength int
		fmt.Sscanf(header, "Content-Length: %d", &contentLength)

		// Lee líneas adicionales hasta encontrar una línea en blanco
		for {
			line, err := reader.ReadString('\n')
			if err != nil {
				fmt.Println("Error al leer línea DAP:", err)
				break
			}
			if line == "\r\n" || line == "\n" {
				break
			}
		}

		// Lee el contenido
		content := make([]byte, contentLength)
		_, err = reader.Read(content)
		if err != nil {
			fmt.Println("Error al leer contenido DAP:", err)
			break
		}

		// Envía la respuesta al cliente WebSocket
		c.WriteMessage(websocket.TextMessage, content)
	}
}

// Estructura para representar una función
type FunctionInfo struct {
	Name string `json:"name"`
	Line int    `json:"line"`
}

// Función para obtener las funciones y sus líneas de código de un archivo Go
func getFunctions(filePath string) ([]FunctionInfo, error) {
	// Ruta absoluta del archivo
	absPath, err := filepath.Abs(filePath)
	if err != nil {
		return nil, err
	}

	// Crear un nuevo conjunto de archivos (file set)
	fset := token.NewFileSet()

	// Analizar el archivo Go
	node, err := parser.ParseFile(fset, absPath, nil, 0)
	if err != nil {
		return nil, err
	}

	var functions []FunctionInfo

	// Recorrer los nodos del archivo
	for _, decl := range node.Decls {
		if funcDecl, ok := decl.(*ast.FuncDecl); ok {
			// Obtener la posición de la función
			pos := fset.Position(funcDecl.Pos())
			functions = append(functions, FunctionInfo{
				Name: funcDecl.Name.Name,
				Line: pos.Line,
			})
		}
	}

	return functions, nil
}

func functionsHandler(c *fiber.Ctx) error {
	filePath := c.Query("filePath")
	if filePath == "" {
		return c.Status(fiber.StatusBadRequest).SendString("El parámetro 'filePath' es requerido")
	}

	functions, err := getFunctions(filePath)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).SendString(err.Error())
	}

	return c.JSON(functions)
}
