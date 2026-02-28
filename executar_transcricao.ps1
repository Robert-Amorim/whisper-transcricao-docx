param(
    [Parameter(Mandatory = $true)]
    [string]$AudioPath,
    [string]$Modelo = "medium"
)

$python = Join-Path $PSScriptRoot ".venv311\Scripts\python.exe"
$script = Join-Path $PSScriptRoot "transcrever_para_docx.py"

if (-not (Test-Path $python)) {
    Write-Host "Ambiente .venv311 não encontrado em: $python"
    Write-Host "Crie o venv com Python 3.11 e instale dependências:"
    Write-Host "  py -3.11 -m venv .venv311"
    Write-Host "  .\.venv311\Scripts\python.exe -m pip install -r requirements.txt"
    exit 2
}

& $python $script $AudioPath $Modelo
exit $LASTEXITCODE
