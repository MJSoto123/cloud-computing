#!/bin/bash
echo "Stress testing para activar el HPA..."
echo ""

BACKEND_URL="http://localhost:3000"

echo "Estresando $BACKEND_URL"
echo ""

for i in {1..1000}; do
  {
    curl -s "$BACKEND_URL/health" > /dev/null
    echo "Request $i completado"
  } &
  
  if (( i % 50 == 0 )); then
    wait
    echo "Stress $((i/50)) completado"
    sleep 2
  fi
done

wait
echo ""
echo "OK"