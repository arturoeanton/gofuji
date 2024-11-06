let ws;
let requestSeq = 1;
let pendingRequests = {};
let currentBreakpoints = {};
let pendingBreakpoints = []; // Almacena breakpoints pendientes antes de 'initialized'
let currentThreadId = null; // Variable global para almacenar el threadId actual
let programPath = ''; // Variable global para almacenar la ruta del programa
let programLaunched = false; // Variable para verificar si el programa ya fue lanzado

function connect() {
    let address = document.getElementById("address").value;
    let port = document.getElementById("port").value;
    programPath = document.getElementById("programPath").value;

    programLaunched = false; // Resetear el estado del lanzamiento del programa

    ws = new WebSocket(`ws://${location.host}/ws`);

    ws.onopen = function() {
        console.log("Conectado al servidor WebSocket");

        // Enviar comando 'connect' al servidor para inicializar el DAPClient
        let connectMessage = {
            command: "connect",
            address: address,
            port: port,
            programPath: programPath
        };
        ws.send(JSON.stringify(connectMessage));

        // Actualizar estado de los botones
        document.getElementById("connectButton").disabled = true;
        document.getElementById("disconnectButton").disabled = false;

        // Enviar solicitud 'initialize'
        sendDAPRequest("initialize", { adapterID: "dlv" }, function(response) {
            console.log("Respuesta a 'initialize':", response);
            // No enviar 'launch' aquí
        });

        // Refrescar la lista de archivos al conectar
        refreshFiles();
    };

    ws.onmessage = function(event) {
        let data;
        try {
            data = JSON.parse(event.data);
        } catch (e) {
            // No es JSON, puede ser un mensaje de texto simple
            data = event.data;
        }

        if (typeof data === 'string') {
            // Mensaje del servidor
            console.log("Mensaje del servidor:", data);
        } else if (Array.isArray(data)) {
            // Es la lista de archivos Go
            console.log("Lista de archivos recibida:", data);
            populateFileSelect(data);
        } else if (data.type === "event") {
            if (data.event === "initialized") {
                console.log("Evento 'initialized' recibido");

                // Establecer breakpoints pendientes
                if (pendingBreakpoints.length > 0) {
                    pendingBreakpoints.forEach(args => {
                        sendDAPRequest("setBreakpoints", args, function(response) {
                            console.log("Respuesta a 'setBreakpoints' (pendiente):", response);
                        });
                    });
                    pendingBreakpoints = [];
                }

                // Puedes establecer breakpoints aquí si lo deseas
                // No enviamos 'configurationDone' aún
            } else if (data.event === "stopped") {
                let threadId = data.body.threadId;
                currentThreadId = threadId; // Guardamos el threadId actual
                getStackTrace(threadId);
            } else if (data.event === "continued") {
                // Limpiar Código en Ejecución y Variables
                clearRunningCodeAndVariables();
                currentThreadId = null; // Reseteamos el threadId actual
            } else {
                console.log("Evento DAP:", data.event);
            }
        } else if (data.type === "response") {
            let seq = data.request_seq;
            if (pendingRequests[seq]) {
                pendingRequests[seq](data);
                delete pendingRequests[seq];
            }
        } else {
            console.log("Mensaje DAP:", data);
        }
    };

    ws.onerror = function(event) {
        console.error("WebSocket error:", event);
    };

    ws.onclose = function() {
        console.log("WebSocket cerrado");
        // Actualizar estado de los botones
        document.getElementById("connectButton").disabled = false;
        document.getElementById("disconnectButton").disabled = true;

        // Limpiar Código en Ejecución y Variables al desconectar
        clearRunningCodeAndVariables();
        currentThreadId = null;
        programLaunched = false;
    };
}

function disconnect() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        let message = {
            command: "disconnect"
        };
        ws.send(JSON.stringify(message));
        ws.close();
    }
}

function sendDAPRequest(command, args, callback) {
    let message = {
        type: "request",
        seq: requestSeq++,
        command: command,
        arguments: args
    };
    pendingRequests[message.seq] = callback;
    ws.send(JSON.stringify(message));
}

function setBreakpoint() {
    let filePath = document.getElementById("filePath").value;
    let line = parseInt(document.getElementById("lineNumber").value);

    if (!filePath || !line) {
        alert("Por favor, selecciona un archivo y especifica el número de línea.");
        return;
    }

    // Agregar el breakpoint a la lista actual
    if (!currentBreakpoints[filePath]) {
        currentBreakpoints[filePath] = [];
    }
    if (!currentBreakpoints[filePath].includes(line)) {
        currentBreakpoints[filePath].push(line);
    }

    // Actualizar la lista de breakpoints en la interfaz
    updateBreakpointsList();

    let args = {
        source: {
            path: filePath
        },
        breakpoints: currentBreakpoints[filePath].map(line => ({ line: line }))
    };

    if (programLaunched || pendingBreakpoints.length === 0) {
        // Si el programa ya fue lanzado o no hay breakpoints pendientes, enviar inmediatamente
        sendDAPRequest("setBreakpoints", args, function(response) {
            console.log("Respuesta a 'setBreakpoints':", response);
        });
    } else {
        // Almacenar el breakpoint pendiente para enviarlo después de 'initialized'
        pendingBreakpoints.push(args);
    }
}

function removeBreakpoint(filePath, line) {
    if (currentBreakpoints[filePath]) {
        currentBreakpoints[filePath] = currentBreakpoints[filePath].filter(l => l !== line);
        if (currentBreakpoints[filePath].length === 0) {
            delete currentBreakpoints[filePath];
        }

        // Actualizar la lista de breakpoints en la interfaz
        updateBreakpointsList();

        // Actualizar los breakpoints en el depurador
        let args = {
            source: {
                path: filePath
            },
            breakpoints: currentBreakpoints[filePath] ? currentBreakpoints[filePath].map(line => ({ line: line })) : []
        };
        sendDAPRequest("setBreakpoints", args, function(response) {
            console.log("Respuesta a 'setBreakpoints' tras eliminar breakpoint:", response);
        });
    }
}

function updateBreakpointsList() {
    let breakpointsList = document.getElementById("breakpointsList");
    breakpointsList.innerHTML = '';

    for (let file in currentBreakpoints) {
        currentBreakpoints[file].forEach(line => {
            let listItem = document.createElement('li');
            listItem.className = 'list-group-item d-flex justify-content-between align-items-center';
            listItem.textContent = `${file}:${line}`;

            let removeBtn = document.createElement('button');
            removeBtn.className = 'btn btn-sm btn-danger';
            removeBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
            removeBtn.onclick = function() {
                removeBreakpoint(file, line);
            };

            listItem.appendChild(removeBtn);
            breakpointsList.appendChild(listItem);
        });
    }
}

function continueExecution() {
    if (!programLaunched) {
        // Enviar solicitud 'launch'
        sendDAPRequest("launch", { program: programPath }, function(response) {
            console.log("Respuesta a 'launch':", response);

            // Enviar 'configurationDone' después de 'launch'
            sendDAPRequest("configurationDone", {}, function(response) {
                console.log("Respuesta a 'configurationDone':", response);

                // Ahora podemos enviar 'continue'
                sendDAPRequest("continue", {}, function(response) {
                    console.log("Respuesta a 'continue':", response);
                });
            });
        });
        programLaunched = true;
    } else {
        sendDAPRequest("continue", {}, function(response) {
            console.log("Respuesta a 'continue':", response);
        });
    }
    currentThreadId = null; // Reseteamos el threadId actual al continuar
}

function pause() {
    sendDAPRequest("pause", {}, function(response) {
        console.log("Respuesta a 'pause':", response);
    });
}

function stepIn() {
    if (currentThreadId !== null) {
        sendDAPRequest("stepIn", { threadId: currentThreadId }, function(response) {
            console.log("Respuesta a 'stepIn':", response);
        });
    } else {
        console.error("No hay threadId actual para 'stepIn'.");
    }
}

function stepOver() {
    if (currentThreadId !== null) {
        sendDAPRequest("next", { threadId: currentThreadId }, function(response) {
            console.log("Respuesta a 'next':", response);
        });
    } else {
        console.error("No hay threadId actual para 'stepOver'.");
    }
}

function stepOut() {
    if (currentThreadId !== null) {
        sendDAPRequest("stepOut", { threadId: currentThreadId }, function(response) {
            console.log("Respuesta a 'stepOut':", response);
        });
    } else {
        console.error("No hay threadId actual para 'stepOut'.");
    }
}

function refreshFiles() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        getGoFiles();
    } else {
        alert("No estás conectado al servidor.");
    }
}

function getGoFiles() {
    let message = {
        command: "getGoFiles"
    };
    ws.send(JSON.stringify(message));
}

function populateFileSelect(files) {
    let fileSelect = $('#filePath');
    fileSelect.empty(); // Limpiar opciones existentes
    fileSelect.append('<option value="">Selecciona un archivo</option>');
    files.forEach(function(file) {
        let option = $('<option></option>').attr('value', file).text(file);
        fileSelect.append(option);
    });
}

function loadSourceCode() {
    let filePath = document.getElementById("filePath").value;
    if (!filePath) {
        document.getElementById("sourceCode").innerHTML = '';
        return;
    }

    fetch(`/source?filePath=${encodeURIComponent(filePath)}`)
        .then(response => response.text())
        .then(content => {
            let sourceCodeElement = document.getElementById("sourceCode");
            let lines = content.split('\n');
            sourceCodeElement.innerHTML = ''; // Limpiar contenido previo

            lines.forEach((line, index) => {
                let lineElem = document.createElement('div');
                lineElem.textContent = `${index + 1}: ${line}`;
                sourceCodeElement.appendChild(lineElem);
            });
        })
        .catch(err => console.error("Error al obtener el código fuente:", err));
}

function getStackTrace(threadId) {
    let args = {
        threadId: threadId,
        startFrame: 0,
        levels: 1
    };

    sendDAPRequest("stackTrace", args, function(response) {
        if (response.success) {
            let frames = response.body.stackFrames;
            if (frames.length > 0) {
                let frame = frames[0];
                console.log("Marco de pila:", frame);
                let source = frame.source;
                let line = frame.line;
                if (source && (source.path || source.sourceReference)) {
                    getRunningCode(source, line);
                } else {
                    console.error("Información de fuente no disponible en el marco de pila");
                }
                getScopes(frame.id);
            } else {
                console.error("No hay marcos de pila disponibles");
            }
        } else {
            console.error("Error al obtener el stack trace:", response.message);
        }
    });
}

function getRunningCode(source, lineNumber) {
    if (source.path || source.sourceReference) {
        let args = {
            source: source
        };

        sendDAPRequest("source", args, function(response) {
            if (response.success) {
                let content = response.body.content;
                let runningCodeElement = document.getElementById("runningCode");
                let lines = content.split('\n');
                runningCodeElement.innerHTML = ''; // Limpiar contenido previo

                lines.forEach((line, index) => {
                    let lineElem = document.createElement('div');
                    if (index + 1 === lineNumber) {
                        lineElem.style.backgroundColor = '#ffffcc'; // Resaltar línea actual
                    }
                    lineElem.textContent = `${index + 1}: ${line}`;
                    runningCodeElement.appendChild(lineElem);
                });
            } else {
                console.error("Error al obtener el código en ejecución:", response.message);
                // Intentar obtener el código directamente desde el servidor
                if (source.path) {
                    fetch(`/source?filePath=${encodeURIComponent(source.path)}`)
                        .then(response => response.text())
                        .then(content => {
                            let runningCodeElement = document.getElementById("runningCode");
                            let lines = content.split('\n');
                            runningCodeElement.innerHTML = ''; // Limpiar contenido previo

                            lines.forEach((line, index) => {
                                let lineElem = document.createElement('div');
                                if (index + 1 === lineNumber) {
                                    lineElem.style.backgroundColor = '#ffffcc'; // Resaltar línea actual
                                }
                                lineElem.textContent = `${index + 1}: ${line}`;
                                runningCodeElement.appendChild(lineElem);
                            });
                        })
                        .catch(err => console.error("Error al obtener el código desde el servidor:", err));
                }
            }
        });
    } else {
        console.error("No hay 'source.path' o 'sourceReference' disponible");
    }
}

function getScopes(frameId) {
    let args = {
        frameId: frameId
    };

    sendDAPRequest("scopes", args, function(response) {
        if (response.success) {
            let scopes = response.body.scopes;
            let variablesElement = document.getElementById("variables");
            variablesElement.innerHTML = ''; // Limpiar contenido previo

            scopes.forEach(scope => {
                let scopeHeader = document.createElement('div');
                scopeHeader.textContent = `Scope: ${scope.name}`;
                scopeHeader.style.fontWeight = 'bold';
                variablesElement.appendChild(scopeHeader);

                getVariables(scope.variablesReference, variablesElement);
            });
        } else {
            console.error("Error al obtener los scopes:", response.message);
        }
    });
}

function getVariables(variablesReference, variablesElement) {
    let args = {
        variablesReference: variablesReference
    };

    sendDAPRequest("variables", args, function(response) {
        if (response.success) {
            let variables = response.body.variables;
            console.log("Variables recibidas:", variables);

            variables.forEach(variable => {
                let varElem = document.createElement('div');
                varElem.textContent = `${variable.name}: ${variable.value}`;
                variablesElement.appendChild(varElem);
            });
        } else {
            console.error("Error al obtener las variables:", response.message);
        }
    });
}

function clearRunningCodeAndVariables() {
    document.getElementById("runningCode").innerHTML = '';
    document.getElementById("variables").innerHTML = '';
}