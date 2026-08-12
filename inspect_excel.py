import pandas as pd

try:
    df = pd.read_excel("I:/APLICACIONES/RUTAS HEALTHY/RUTA BRAYAN.xlsx")
    print("Columns in RUTA BRAYAN.xlsx:", df.columns.tolist())
    print("\nFirst 15 rows:")
    # Set display options to print all columns
    pd.set_option('display.max_columns', None)
    pd.set_option('display.width', 1000)
    print(df)
except Exception as e:
    print("Error:", e)
